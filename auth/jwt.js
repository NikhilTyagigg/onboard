const jwt = require("jsonwebtoken");
const config = require("config");
const moment = require("moment");
const {
  NotAuthorizedError,
  ErrorCodes,
  ForbiddenError,
} = require("../helper/errors");
const logger = require("../helper/logger");

const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const models = require("../models/index");
const Users = models.User;
const {
  redisHGetAsync,
  redisHSetAsync,
  redisHDelAsync,
  redisLPushAsync,
  redisLRemAsync,
  redisLPopAsync,
  redisDelAsync,
} = require("../helper/redis");

const JWT_REFRESH_TOKENS = "ONBOARD_APP_JWT_REFRESH_TOKENS";
const JWT_ACCESS_TOKENS = "ONBOARD_APP_JWT_ACCESS_TOKENS";

const jwtConfig = config.get("jwt");

var main = {};

const userTokenListName = (user) => {
  return `USER_TOKENS_${user.userId}`;
};

/** this method generates the token **/
const getToken = (payload, secret, expiresIn) => {
  if (expiresIn) {
    return jwt.sign(payload, secret, { expiresIn });
  } else {
    return jwt.sign(payload, secret);
  }
};
// console.log("gggg=",payload);

const getAccessToken = (user, neverExpire = false) => {
  return getToken(
    {
      userId: user.userId,
      email: user.email,
    },
    jwtConfig.secret_key,
    neverExpire ? null : jwtConfig.token_life
  );
};

const getRefreshToken = (user) => {
  return getToken(
    {
      userId: user.userId,
      email: user.email,
    },
    jwtConfig.refresh_secret_key,
    jwtConfig.refresh_token_life
  );
};

// const verifyAccessToken = async (token) => {
//   const value = await redisHGetAsync(JWT_ACCESS_TOKENS, token);
//   if (!value) {
//     throw new NotAuthorizedError();
//   }
//   let user = null;
//   try {
//     if (value) {
//       user = JSON.parse(value).user;
//     }
//     const decode = jwt.verify(token, jwtConfig.secret_key, {
//       expiresIn: jwtConfig.token_life,
//     });
//     return user;
//   } catch (err) {
//     await redisHDelAsync(JWT_ACCESS_TOKENS, token);
//     if (user) {
//       await redisLRemAsync(userTokenListName(user), 0, token);
//     }
//     throw new NotAuthorizedError(
//       "access token expired",
//       ErrorCodes.ERR_ACCESS_TOKEN_EXPIRED
//     );
//   }
// };
const verifyAccessToken = async (token) => {
  // Retrieve the token from Redis
  const value = await redisHGetAsync(JWT_ACCESS_TOKENS, token);
  if (!value) {
    throw new NotAuthorizedError();
  }

  let user = null;
  try {
    if (value) {
      user = JSON.parse(value).user;
    }

    // Verify the token without expiresIn option
    const decode = jwt.verify(token, jwtConfig.secret_key);

    return user;
  } catch (err) {
    // Token verification failed, handle the error
    await redisHDelAsync(JWT_ACCESS_TOKENS, token);
    if (user) {
      await redisLRemAsync(userTokenListName(user), 0, token);
    }

    // Throw error with specific message if the token has expired
    if (err.name === "TokenExpiredError") {
      throw new NotAuthorizedError(
        "access token expired",
        ErrorCodes.ERR_ACCESS_TOKEN_EXPIRED
      );
    }

    // Throw generic authorization error for other cases
    throw new NotAuthorizedError();
  }
};

const verifyRefreshToken = async (token) => {
  console.log(`Verifying refresh token: ${token}`);
  const value = await redisHGetAsync(JWT_REFRESH_TOKENS, token);
  console.log(`Token value from Redis: ${value}`);

  if (!value) {
    console.log(`Refresh token not found in Redis: ${token}`);
    throw new NotAuthorizedError();
  }

  let user = null;
  try {
    user = JSON.parse(value);
    console.log(`Parsed user from Redis: ${JSON.stringify(user)}`);

    const decode = jwt.verify(token, jwtConfig.refresh_secret_key);
    console.log(`Decoded token: ${JSON.stringify(decode)}`);

    return user;
  } catch (err) {
    console.log(`Error verifying refresh token: ${err}`);
    await redisHDelAsync(JWT_REFRESH_TOKENS, token);
    if (user) {
      await redisLRemAsync(userTokenListName(user), 0, token);
    }
    throw new NotAuthorizedError(
      "refresh token expired",
      ErrorCodes.ERR_REFRESH_TOKEN_EXPIRED
    );
  }
};

main.refreshAccessToken = (refreshToken) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(
        `Starting refreshAccessToken with refreshToken: ${refreshToken}`
      );

      const tokenInRedis = await redisHGetAsync(
        JWT_REFRESH_TOKENS,
        refreshToken
      );
      console.log(`Token in Redis: ${tokenInRedis}`);

      if (!refreshToken || !tokenInRedis) {
        console.log(`Refresh token not found or invalid: ${refreshToken}`);
        reject(new NotAuthorizedError());
        return;
      }

      const user = await verifyRefreshToken(refreshToken);
      console.log(`Verified user: ${JSON.stringify(user)}`);

      const {
        accessToken: storedAccessToken,
        refreshToken: storedRefreshToken,
      } = await getUserToken(user.userId);
      console.log(
        `Stored access token: ${storedAccessToken}, stored refresh token: ${storedRefreshToken}`
      );

      if (storedRefreshToken !== refreshToken) {
        console.log(
          `Stored refresh token does not match the provided refresh token`
        );
        reject(new NotAuthorizedError());
        return;
      }

      const newAccessToken = getAccessToken(user);
      console.log(`Generated new access token: ${newAccessToken}`);

      await updateUserToken(user.userId, newAccessToken, refreshToken);
      await redisHSetAsync(
        JWT_ACCESS_TOKENS,
        newAccessToken,
        JSON.stringify({ refreshToken, user })
      );
      await redisLPushAsync(userTokenListName(user), newAccessToken);

      resolve(newAccessToken);
    } catch (err) {
      console.error("Error in refreshAccessToken:", err);
      reject(err);
    }
  });
};

main.grantAccess = (user, neverExpire = false) => {
  console.log(user);
  if (!user || !user.userId || (!user.email && !user.phone)) {
    return Promise.reject(new NotAuthorizedError());
  }
  return new Promise(async (resolve, reject) => {
    try {
      const accessToken = getAccessToken(user, neverExpire);
      const refreshToken = getRefreshToken(user);

      logger.debug(`Generated AccessToken: ${accessToken}`);
      logger.debug(`Generated RefreshToken: ${refreshToken}`);

      await redisHSetAsync(
        JWT_ACCESS_TOKENS,
        accessToken,
        JSON.stringify({ refreshToken, user })
      );
      logger.debug(`Stored AccessToken in Redis`);

      await redisHSetAsync(
        JWT_REFRESH_TOKENS,
        refreshToken,
        JSON.stringify(user)
      );
      logger.debug(`Stored RefreshToken in Redis`);

      await redisLPushAsync(userTokenListName(user), accessToken, refreshToken);
      logger.debug(`Pushed tokens to user's token list`);

      logger.debug(`login from ${user.email}`);
      updateUserToken(user.userId, accessToken, refreshToken);

      resolve({ token: accessToken, refreshToken });
    } catch (err) {
      logger.error(`Error in grantAccess: ${err}`);
      reject(err);
    }
  });
};

const extractAccessTokenFromRequest = (req) => {
  const authorizationHeader =
    req.headers["authorization"] || req.query.authToken;

  if (
    !authorizationHeader ||
    !authorizationHeader.trim().startsWith("Bearer ")
  ) {
    throw new NotAuthorizedError("Access token can not be null");
  }
  //Get Token arrray by spliting
  return authorizationHeader.trim().split(" ")[1];
};

main.removeAccessForToken = async (accessToken) => {
  const value = JSON.parse(
    await redisHGetAsync(JWT_ACCESS_TOKENS, accessToken)
  );
  if (!value) {
    return;
  }
  const { refreshToken, user } = value;
  updateUserToken(user.userId, null, null);
  await redisHDelAsync(JWT_ACCESS_TOKENS, accessToken);
  await redisHDelAsync(JWT_REFRESH_TOKENS, refreshToken);
  await redisLRemAsync(userTokenListName(user), 0, accessToken);
  await redisLRemAsync(userTokenListName(user), 0, refreshToken);
};

main.removeAccess = (req) => {
  return new Promise(async (resolve, reject) => {
    const accessToken = extractAccessTokenFromRequest(req);
    await main.removeAccessForToken(accessToken);
    resolve();
  });
};

main.removeAllAccess = async (user) => {
  let accessToken = await redisLPopAsync(userTokenListName(user));
  while (accessToken) {
    removeAccessForToken(accessToken);
    accessToken = await redisLPopAsync(userTokenListName(user));
  }
  await redisDelAsync(userTokenListName(user));
};

/** this method verified the token **/
main.checkAccess = (req, res, next) => {
  const accessToken = extractAccessTokenFromRequest(req);
  if (!accessToken) {
    logger.debug("invalid login attempt");
    next(new NotAuthorizedError());
    return;
  }
  try {
    var promise1 = verifyAccessToken(accessToken);
    promise1
      .then(async (user) => {
        req.user = user;
        next();
      })
      .catch(next);
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

function updateUserToken(userId, access_token, refresh_token) {
  return Users.findOne({
    where: {
      userId: userId,
    },
  })
    .then((user) => {
      if (!user) throw new NotAuthorizedError("Not a valid user");

      var today_date = moment();
      var expiry_time = moment(today_date).add(jwtConfig.expiry_hours, "hours");
      expiry_time = moment(expiry_time).format("YYYY-MM-DD HH:mm:ssZ");

      return user
        .update({
          accessToken: access_token,
          refreshToken: refresh_token,
        })
        .then((r) => {
          return true;
        });
    })
    .catch(function (err) {
      console.log(err);
      return false;
    });
}

function getUserToken(user_id) {
  return Users.findOne({
    where: {
      userId: user_id,
    },
  })
    .then((user) => {
      if (!user) throw new NotAuthorizedError("Not a valid user");

      var access_token = user.accessToken;
      var refresh_token = user.refreshToken;

      return { accessToken: access_token, refreshToken: refresh_token };
    })
    .catch(function (err) {
      console.log(err);
      return false;
    });
}

module.exports = main;
