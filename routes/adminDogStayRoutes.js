// ======================================================================
// 🐶 AdminDogStayRoutes.js  — FULL UPDATED VERSION (No logic changed)
// ======================================================================

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");

const User = require("../models/User");
const Listing = require("../models/Listing");
const Booking = require("../models/BookingRoom");
const Payment = require("../models/Payment");
const DogStay = require("../models/DogStay");

const router = express.Router();

// ======================= Multer Uploads ======================= //
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    cb(null, uniqueSuffix + fileExtension);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 5 },
});

// ======================================================================
// 📊 ADMIN BASE ROUTES
// ======================================================================

// Dashboard Stats
router.get("/stats", async (req, res) => {
  res.status(200).json({
    totalListings: 100,
    bookingsToday: 5,
    activeUsers: 50,
    revenueMonth: 500000,
    avgRating: 4.5,
  });
});

// Users
router.get("/users", async (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

// Listings
router.get("/listings", async (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

// Bookings
router.get("/bookings", async (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

// Payments
router.get("/payments", async (req, res) => {
  res.status(200).json({ success: true, data: [] });
});


// ======================================================================
// 🏡 DOGSTAY — CREATE LISTING
// ======================================================================

router.post(
  "/dogstay",
  upload.fields([
    { name: "photos", maxCount: 5 },
    { name: "video", maxCount: 1 },
    { name: "idProof", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const data = req.body;
      const files = req.files;

      // ---------------------------------------------
      // ⭐ FIX: use REAL hostId from frontend storage
      // ---------------------------------------------
      if (!data.hostId) {
        return res.status(400).json({
          success: false,
          message: "hostId is missing. Host must be logged in.",
        });
      }

      // convert string to mongoose ID if needed
      data.hostId = new mongoose.Types.ObjectId(data.hostId);

      // Parse JSON fields
      ["amenities", "allowedSizes"].forEach((field) => {
        if (data[field] && typeof data[field] === "string") {
          data[field] = JSON.parse(data[field]);
        }
      });

      // Number fields
      ["pricePerDay", "additionalPetCharge", "minimumStay", "weightLimit"].forEach(
        (field) => {
          if (data[field] === "") delete data[field];
          else if (data[field]) data[field] = Number(data[field]);
        }
      );

      // Boolean conversion
      if (data.termsConfirmed !== undefined) {
        data.termsConfirmed = data.termsConfirmed === "true";
      }

      const rel = "uploads/";

      if (files.photos) {
        data.photos = files.photos.map((f) => rel + path.basename(f.path));
      }
      if (files.video) {
        data.video = rel + path.basename(files.video[0].path);
      }
      if (files.idProof) {
        data.idProof = rel + path.basename(files.idProof[0].path);
      }

      const listing = new DogStay(data);
      const saved = await listing.save();

      res.status(201).json({
        success: true,
        message: "DogStay listing created successfully",
        data: saved,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Server Error creating DogStay",
        error: err.message,
      });
    }
  }
);

// ======================================================================
// 📌 GET ALL DOGSTAY LISTINGS
// ======================================================================

router.get("/dogstay", async (req, res) => {
  try {
    const listings = await DogStay.find()
      .populate("hostId", "name email mobile")
      .sort({ createdAt: -1 })
      .select("-__v");

    res.status(200).json({ success: true, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err });
  }
});

// ======================================================================
// ❌ DELETE LISTING
// ======================================================================

router.delete("/dogstay/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await DogStay.findById(id);
    if (!listing)
      return res.status(404).json({ success: false, message: "Listing not found" });

    await DogStay.findByIdAndDelete(id);

    const filesToDelete = [];

    if (listing.photos) {
      listing.photos.forEach((f) => {
        filesToDelete.push(path.join(UPLOADS_DIR, path.basename(f)));
      });
    }

    if (listing.idProof) {
      filesToDelete.push(path.join(UPLOADS_DIR, path.basename(listing.idProof)));
    }

    await Promise.all(
      filesToDelete.map((f) =>
        fsPromises.unlink(f).catch(() => {})
      )
    );

    res.json({ success: true, message: "Listing deleted", deletedId: id });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err });
  }
});

// ======================================================================
// 🔵 APPROVE LISTING
// ======================================================================

router.put("/approve/:id", async (req, res) => {
  try {
    const listing = await DogStay.findById(req.params.id);
    if (!listing)
      return res.status(404).json({ success: false, message: "Listing not found" });

    listing.isApproved = true;
    listing.isRejected = false;

    await listing.save();

    res.json({ success: true, message: "Listing approved", listing });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ======================================================================
// 🔄 UPDATE STATUS (Approve / Reject)
// ======================================================================

router.patch("/status/:id", async (req, res) => {
  try {
    const { isApproved, isRejected } = req.body;
    const listing = await DogStay.findById(req.params.id);

    if (!listing)
      return res.status(404).json({ success: false, message: "Listing not found" });

    if (isApproved !== undefined) listing.isApproved = isApproved;
    if (isRejected !== undefined) listing.isRejected = isRejected;

    const updated = await listing.save();
    res.json({ success: true, listing: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ======================================================================
// 🟢 GET APPROVED LISTINGS ONLY
// ======================================================================

router.get("/approved", async (req, res) => {
  try {
    const approved = await DogStay.find({ isApproved: true });
    res.json({ success: true, listings: approved });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ======================================================================
// 🔍 GET SINGLE LISTING BY ID
// ======================================================================

router.get('/:id', async (req, res) => {
  try {
    const listing = await DogStay.findById(req.params.id)
      .populate('hostId', 'name email mobile');

    if (!listing) {
      return res.status(404).json({ message: 'DogStay not found' });
    }

    res.json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching DogStay' });
  }
});

//UPDATE LISTING
router.put("/dogstay/:id", async (req, res) => {
  try {
    const updated = await DogStay.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    res.json({ success: true, listing: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed", error: err.message });
  }
});

// ======================================================================
// EXPORT ROUTER
// ======================================================================
module.exports = router;
