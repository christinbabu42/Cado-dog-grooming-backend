const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

/**
 * ✅ GET ALL HOSTS (Admin / Dashboard)
 * GET /api/hosts?role=host
 */
router.get("/", async (req, res) => {
  try {
    const hosts = await User.find({ role: "host" }).select("-password");

    res.json({
      success: true,
      count: hosts.length,
      hosts,
    });
  } catch (err) {
    console.error("Get hosts error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load hosts",
    });
  }
});

/**
 * ✅ GET LOGGED-IN HOST PROFILE (Token Based)
 * GET /api/hosts/profile
 */
router.get("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const host = await User.findById(decoded.mongoId).select("-password");

    if (!host) {
      return res.status(404).json({
        success: false,
        message: "Host not found",
      });
    }

    res.json({
      success: true,
      host,
    });

  } catch (err) {
    console.error("Host profile error:", err);
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

module.exports = router;
