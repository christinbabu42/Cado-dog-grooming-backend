const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Review = require("../models/Review");
const DogStay = require("../models/DogStay");
const auth = require("../middlewares/auth");

router.get("/host/:hostId", auth, async (req, res) => {
  try {
    const { hostId } = req.params;

    if (!hostId || hostId === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Host ID missing"
      });
    }

    const hostObjectId = new mongoose.Types.ObjectId(hostId);

    const rooms = await DogStay.find({ hostId: hostObjectId }).select("_id roomName");
    if (!rooms.length) return res.json({ success: true, reviews: [] });

    const roomIds = rooms.map((room) => room._id);

    const reviews = await Review.find({ dogStay: { $in: roomIds } })
      .populate("user", "name email profilePic") // return all user details
      .populate("dogStay", "roomName location address") // return all room details
      .sort({ createdAt: -1 });

      console.log(reviews.map(r => ({
  reviewId: r._id,
  userId: r.user?._id,
  userName: r.user?.name
})));


    res.json({ success: true, reviews });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
