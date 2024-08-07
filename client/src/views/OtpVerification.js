import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Input,
  Button,
  Spinner,
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  Label,
} from "reactstrap";
import { verifyOtp, signUpHandler, resendOtp } from "../services/agent";
import { statusCode } from "../utility/constants/utilObject";
import { showErrorToast, showSuccessToast } from "../utility/helper";
import "@styles/react/pages/page-authentication.scss";
import { otpHandler } from "../services/agent";

const OtpVerification = ({ userData, otp }) => {
  const [userotp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();

  const handleOtpChange = (e) => {
    setOtp(e.target.value);
  };

  const handleOtpSubmit = async () => {
    setLoading(true);
    try {
      let payload;

      if (userData.username.match(/^\d+$/)) {
        payload = {
          phone: "+91" + userData.username,
          userOtp: userotp,
          otp: otp,
        };
      } else {
        payload = {
          email: userData.username,
          userOtp: userotp,
          otp: otp,
        };
      }

      const res = await verifyOtp(payload);

      if (res.status == statusCode.HTTP_200_OK) {
        const signUpRes = await signUpHandler(userData);
        setLoading(false);
        if (signUpRes.status == statusCode.HTTP_200_OK) {
          showSuccessToast("Account created successfully. Please log in.");
          navigate("/login");
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

  const handleResendOtp = async () => {
    setResendLoading(true);
    try {
      let payload;

      if (userData.username.match(/^\d+$/)) {
        payload = {
          phone: "+91" + userData.username,
        };
      } else {
        payload = {
          email: userData.username,
        };
      }

      const res = await otpHandler(payload);

      if (res.status == statusCode.HTTP_200_OK) {
        showSuccessToast("OTP has been resent successfully.");
      } else {
        showErrorToast("Failed to resend OTP, please try again.");
      }
    } catch (err) {
      showErrorToast("An error occurred while resending the OTP.");
      console.error("Error:", err);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div
      className="otp-verification"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f5f5f5",
      }}
    >
      <Card
        style={{
          width: "400px",
          padding: "20px",
          borderRadius: "10px",
          boxShadow: "0 0 10px rgba(0,0,0,0.1)",
        }}
      >
        <CardBody>
          <CardTitle tag="h2" className="text-center mb-4">
            Verify OTP
          </CardTitle>
          <Form>
            <FormGroup>
              <Label for="otp">Enter 4-digit OTP</Label>
              <Input
                type="text"
                id="otp"
                placeholder="Enter OTP"
                value={userotp}
                onChange={handleOtpChange}
                style={{
                  marginBottom: "15px",
                  padding: "10px",
                  fontSize: "16px",
                }}
              />
            </FormGroup>
            <Button
              color="primary"
              onClick={handleOtpSubmit}
              disabled={loading}
              block
              style={{ padding: "10px", fontSize: "16px" }}
            >
              {loading ? <Spinner size="sm" /> : "Verify OTP"}
            </Button>
          </Form>
          <Button
            color="link"
            onClick={handleResendOtp}
            disabled={resendLoading}
            block
            style={{ marginTop: "10px", fontSize: "16px" }}
          >
            {resendLoading ? <Spinner size="sm" /> : "Resend OTP"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
};

export default OtpVerification;
