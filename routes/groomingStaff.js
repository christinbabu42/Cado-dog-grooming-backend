const express = require("express");
const router = express.Router();
const GroomingStaff = require("../models/GroomingStaff");
const User = require("../models/User");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 📁 Ensure uploads folder exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ⚙️ Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });


// ✅ POST — Add new grooming staff (USER ID = STAFF ID)
router.post("/", upload.single("idProof"), async (req, res) => {
  try {
    const {
      userId, // 🔥 USER _id
      fullName,
      email,
      phone,
      alternatePhone,
      experience,
      placeAddress,
      coverLetter,
      skills,
      lat,
      lng
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    // 🔎 Check if user exists
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 🚫 Prevent duplicate staff entry
    const alreadyStaff = await GroomingStaff.findOne({ staffID: userId });
    if (alreadyStaff) {
      return res.status(400).json({
        success: false,
        message: "Staff profile already exists for this user"
      });
    }

    const parsedSkills = skills ? JSON.parse(skills) : [];

    const newStaff = new GroomingStaff({
      staffID: userId, // ✅ SAME AS USER _id
      fullName,
      email,
      phone,
      alternatePhone,
      experience,
      placeAddress,
      coverLetter,
      skills: parsedSkills,
      location: {
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null
      },
      idProof: req.file ? req.file.filename : null
    });

    await newStaff.save();

    res.status(201).json({
      success: true,
      message: "Grooming staff application submitted",
      data: newStaff
    });

  } catch (error) {
    console.error("Error saving staff:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});


// ✅ GET — All grooming staff
router.get("/", async (req, res) => {
  try {
    const staffList = await GroomingStaff
      .find()
      .populate("staffID", "name email phone role") // 🔥 User data
      .sort({ submissionDate: -1 });

    res.json({ success: true, data: staffList });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// 🧩 GET single groomer
router.get("/:id", async (req, res) => {
  try {
    const groomer = await GroomingStaff
      .findById(req.params.id)
      .populate("staffID", "name email phone");

    if (!groomer) {
      return res.status(404).json({ success: false, message: "Groomer not found" });
    }

    res.json({ success: true, data: groomer });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✏️ UPDATE groomer
router.put("/:id", async (req, res) => {
  try {
    const updated = await GroomingStaff.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Groomer not found" });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ APPROVE groomer
router.put("/:id/approve", async (req, res) => {
  try {
    const groomer = await GroomingStaff.findById(req.params.id);
    if (!groomer) {
      return res.status(404).json({ success: false, message: "Groomer not found" });
    }

    groomer.isApproved = true;
    await groomer.save();

    res.json({
      success: true,
      message: "Groomer approved successfully",
      data: groomer
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// 🗑 DELETE groomer
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await GroomingStaff.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Groomer not found" });
    }

    res.json({ success: true, message: "Groomer deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
