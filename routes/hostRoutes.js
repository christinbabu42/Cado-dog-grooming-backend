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

const auth = require("../middlewares/auth");

router.get("/profile", auth, async (req, res) => {
    try {
        const host = await User.findById(req.user.mongoId)
            .select("-password");

        if (!host) {
            return res.status(404).json({
                success:false,
                message:"Host not found"
            });
        }

        res.json({
            success:true,
            host
        });

    } catch(err){
        console.error(err);

        res.status(500).json({
            success:false,
            message:"Server error"
        });
    }
});

module.exports = router;
