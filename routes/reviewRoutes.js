const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Review = require('../models/Review');
const DogStay = require('../models/DogStay');
const auth = require('../middlewares/auth');

// ---------------------------------------------
// ✅ Ensure Upload Directory Exists
// ---------------------------------------------
const uploadDir = "uploads/reviews";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("📁 Created missing folder:", uploadDir);
}

// ---------------------------------------------
// ✅ Multer Storage Configuration
// ---------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname);
        cb(null, `review-${req.params.roomId}-${Date.now()}${extension}`);
    }
});

const upload = multer({ storage });

// ---------------------------------------------
// ✅ POST: Submit Review (with optional photo)
// ---------------------------------------------
router.post('/:roomId', auth, upload.single('photo'), async (req, res) => {
    const { roomId } = req.params;
    const { reviewText, rating } = req.body;
    const userId = req.user.mongoId;

    const photoPath = req.file ? req.file.path : undefined;

    try {
        if (!reviewText || !rating) {
            if (photoPath) fs.unlinkSync(photoPath);
            return res.status(400).json({ message: 'Review text and rating are required.' });
        }

        const dogStay = await DogStay.findById(roomId);
        if (!dogStay) {
            return res.status(404).json({ message: "DogStay not found" });
        }

        // ⭐ FIX — HOST CHECK (do not remove your logic)
        const hostId = dogStay.hostId || dogStay.ownerId || null;

        const newReview = new Review({
            dogStay: roomId,
            user: userId,
            hostId: hostId,
            reviewText,
            rating: Number(rating),
            photo: photoPath
        });

        await newReview.save();

        // ⭐ Recalculate rating (NO CHANGE to your logic)
        const reviews = await Review.find({ dogStay: roomId, approved: true });
        const reviewCount = reviews.length;
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : 0;

        await DogStay.findByIdAndUpdate(roomId, {
            rating: avgRating,
            reviewCount
        });

        res.status(201).json({
            message: 'Review submitted successfully. It is pending admin approval.',
            photoPath: photoPath ? photoPath.replace(/\\/g, '/') : null
        });

    } catch (err) {
        console.error('❌ Error submitting review:', err.message);
        res.status(500).json({ message: 'Server error during review submission.' });
    }
});

// ---------------------------------------------
// ✅ GET: Fetch Host Reviews (Based on Cookie JWT)
// ⚠️ PLACED BEFORE /:roomId TO PREVENT CAST ERRORS
// ---------------------------------------------
router.get("/my-reviews", auth, async (req, res) => {
  try {
    const reviews = await Review.find({
      hostId: req.user.mongoId,
      approved: true
    })
      .populate("user", "name")
      .populate("dogStay");

    res.json({
      success: true,
      reviews
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ---------------------------------------------
// ✅ GET: Fetch Approved Reviews + User Info
// ---------------------------------------------
router.get('/:roomId', async (req, res) => {
    const { roomId } = req.params;

    if (!roomId) {
        return res.status(400).json({ message: 'Missing Room ID parameter.' });
    }

    try {
        const reviews = await Review.find({
            dogStay: roomId,
            approved: true
        })
        .populate('user', 'name username profilePhoto')  // ⭐ ADDED name so username appears
        .sort({ createdAt: -1 });

        // If user got deleted, avoid crash
        const safeReviews = reviews.map(r => ({
            ...r._doc,
            user: r.user || { name: "Deleted User", username: "N/A", profilePhoto: null }
        }));

        res.json(safeReviews);

    } catch (err) {
        console.error('❌ Error fetching reviews:', err);

        if (err.name === 'CastError') {
            return res.status(404).json({ message: 'Invalid Room ID format.' });
        }

        res.status(500).json({ message: 'Server error fetching reviews.' });
    }
});

// ---------------------------------------------
// ✅ POST: Host Respond to Review (FIXED)
// ---------------------------------------------
router.post('/respond/:reviewId', auth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Response text required"
      });
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    // --------------------------------------------------
    // ✅ CHANGE #1 — RESOLVE CORRECT HOST ID
    // --------------------------------------------------
    let resolvedHostId = review.hostId;

    // fallback for old / broken data
    if (!resolvedHostId) {
      const dogStay = await DogStay.findById(review.dogStay);
      resolvedHostId = dogStay?.hostId;
    }

    if (!resolvedHostId) {
      return res.status(403).json({
        success: false,
        message: "Host ownership not resolved"
      });
    }

    // --------------------------------------------------
    // ✅ CHANGE #2 — STRICT OWNERSHIP CHECK (FIXED)
    // --------------------------------------------------
    if (
      resolvedHostId.toString() !== req.user.mongoId.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: You are not the owner of this review"
      });
    }

    // --------------------------------------------------
    // ✅ SAVE RESPONSE
    // --------------------------------------------------
    review.hostResponse = {
      text,
      respondedAt: new Date()
    };

    await review.save();

    res.json({
      success: true,
      response: review.hostResponse
    });

  } catch (err) {
    console.error("❌ Respond error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;