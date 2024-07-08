const bcrypt = require("bcrypt");
const { User, Vehicle } = require("../models");

exports.resetPassword = async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body; // Assuming user info is added to req.user by middleware

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSamePassword = await bcrypt.compare(password, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        message: "You cannot use the same password as previously set",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.update({ password: hashedPassword }, { where: { email } });
    await User.update(
      { ConfirmPassword: hashedPassword },
      { where: { email } }
    );

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error, please try again later" });
  }
};
exports.favoriteBus = async (req, res) => {
  try {
    const token = localStorage.getItem("token");
    console.log("______________", token);
    if (!token) {
      return res.status(401).json({ message: "Access denied" });
    }

    // Retrieve the token from Redis
    const value = await redisHGetAsync("jwt_access_tokens", token);
    if (!value) {
      throw new NotAuthorizedError();
    }

    let user = null;
    if (value) {
      user = JSON.parse(value).user;
    }

    // Verify the token without expiresIn option
    jwt.verify(token, process.env.JWT_SECRET_KEY);

    const { vehicleId } = req.body;

    // Ensure the vehicleId is valid (assuming Vehicle model is correctly imported)
    const bus = await Vehicle.findById(vehicleId);
    if (!bus) {
      return res.status(404).json({ message: "Bus not found" });
    }

    // Retrieve user details based on the verified token
    const existingUser = await User.findById(user.id);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Toggle the favorite status
    const isFavorite = existingUser.favorites.includes(vehicleId);
    if (isFavorite) {
      existingUser.favorites = existingUser.favorites.filter(
        (fav) => fav.toString() !== vehicleId
      );
    } else {
      existingUser.favorites.push(vehicleId);
    }

    // Save the updated user document
    await existingUser.save();

    // Respond with success message and updated favorite status
    res
      .status(200)
      .json({ message: "Favorite status updated", isFavorite: !isFavorite });
  } catch (err) {
    // Handle errors, including token expiration
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Access token expired",
        code: ErrorCodes.ERR_ACCESS_TOKEN_EXPIRED,
      });
    }
    res.status(401).json({ message: "Not authorized" });
  }
};
