const express = require("express");
const User = require("../models/User");
const auth = require("../middlewares/auth");
const GroomingStaff = require("../models/GroomingStaff");


const router = express.Router();



/* =========================
   GET ALL USERS (ADMIN)
========================= */
router.get("/all", auth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   GET CURRENT USER
========================= */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.mongoId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let staffProfile = null;

    if (user.role === "grstaff") {
      staffProfile = await GroomingStaff.findOne({ staffID: user._id }).lean(); // ✅ use lean() for plain object
    }

    res.json({
      ...user.toObject(),
      staffProfile: staffProfile || null, // always send null if not found
    });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


/* =========================
   UPDATE USER PROFILE
========================= */
router.put("/update", auth, async (req, res) => {
  try {
    const { name, phone, country, address } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.mongoId,
      {
        name,
        phone,
        country,
        address
      },
      { new: true }
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   SAVE / UPDATE LOCATION
========================= */
router.put("/location", auth, async (req, res) => {
  try {
    const { address, lat, lng } = req.body;

    const updateData = {};

    // Save address if provided
    if (address) {
      updateData.address = address;
    }

    // Save GPS only if both exist
    if (lat && lng) {
      updateData.location = {
        address,
        lat,
        lng
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user.mongoId,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      message: "Location updated successfully",
      user
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   BAN / UNBAN USER (SUPERADMIN ONLY)
========================= */
router.put("/status/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Only superadmin can ban users." });
    }

    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      success: true,
      message: `User ${status === "suspended" ? "banned" : "unbanned"} successfully`,
      user
    });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   CHANGE USER ROLE (SUPERADMIN ONLY)
========================= */
router.put("/role/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Only superadmin can change roles." });
    }

    const { role } = req.body;

    const allowedRoles = ["owner","grstaff","gradmin", "host", "admin", "superadmin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      message: "User role updated successfully",
      user,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ................................
// // PUT /api/users/bank-details
// ................................

router.put("/bank-details", auth, async (req, res) => {
  try {
    const { accountHolder, bankName, ifsc, accountNumber } = req.body;

    if (!accountHolder || !bankName || !ifsc || !accountNumber) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // 🔹 Find grooming staff using logged-in user id
const staff = await GroomingStaff.findOneAndUpdate(
  { staffID: req.user.mongoId }, // find staff linked to logged-in user
  {
    bankDetails: { accountHolder, bankName, ifsc, accountNumber },
  },
  { new: true }
);

if (!staff) {
  return res.status(404).json({
    success: false,
    message: "Grooming staff profile not found",
  });
}

res.json({
  success: true,
  message: "Bank details saved successfully",
  staff,
});

  } catch (err) {
    console.error("Error saving bank details:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});




module.exports = router;
