import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Button, Spinner } from "reactstrap";
import { verifyOtp, signUpHandler } from "../services/agent";
import { statusCode } from "../utility/constants/utilObject";
import { showErrorToast, showSuccessToast } from "../utility/helper";
import "@styles/react/pages/page-authentication.scss";

const OtpVerification = ({ userData, otp }) => {
  const [userotp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate(); // Use useNavigate instead of useHistory

  const handleOtpChange = (e) => {
    setOtp(e.target.value);
  };

  const handleOtpSubmit = async () => {
    setLoading(true);
    try {
      // Assuming userData.username can be either an email or a phone number
      let payload;

      if (userData.username.match(/^\d+$/)) {
        // If userData.username is a phone number
        payload = {
          phone: "+91" + userData.username,
          userOtp: userotp,
          otp: otp,
        };
      } else {
        // If userData.username is an email
        payload = {
          email: userData.username,
          userOtp: userotp,
          otp: otp,
        };
      }
      // console.log("payload", payload);
      const res = await verifyOtp(payload);
      // console.log(userData);

      if (res.status == statusCode.HTTP_200_OK) {
        const signUpRes = await signUpHandler(userData);
        setLoading(false);
        if (signUpRes.status == statusCode.HTTP_200_OK) {
          showSuccessToast("Account created successfully. Please log in.");
          navigate("/login"); // Navigate to login page
        } else {
          showErrorToast(signUpRes.data.message);
        }
      } else {
        setLoading(false);
        showErrorToast("Invalid OTP, please try again.");
      }
    } catch (err) {
      setLoading(false);
      showErrorToast("User is already registered");
      console.error("Error:", err);
    }
  };

  return (
    <div className="otp-verification">
      <div className="formCard">
        <h2>Verify OTP</h2>
        <Input
          type="text"
          placeholder="Enter 4-digit OTP"
          value={userotp}
          onChange={handleOtpChange}
        />
        <Button onClick={handleOtpSubmit} disabled={loading}>
          {loading ? <Spinner size="sm" /> : "Verify OTP"}
        </Button>
      </div>
      <Button>Resend Otp</Button>
    </div>
  );
};

export default OtpVerification;
