const express = require("express");
const mongoose = require("mongoose");
const BookingRoom = require("../models/BookingRoom");
const DogStay = require("../models/DogStay");

const router = express.Router();

// ---------------------------------------------------------
// 1️⃣ CREATE A NEW ROOM (NO CHANGE)
// ---------------------------------------------------------
router.post("/create", async (req, res) => {
  try {
    const { userId, listingId, roomName } = req.body;

    if (!userId || !listingId || !roomName)
      return res.status(400).json({ message: "Missing required fields" });

    const newRoom = new BookingRoom({
      userId: new mongoose.Types.ObjectId(userId),
      listingId: new mongoose.Types.ObjectId(listingId),
      roomName
    });

    await newRoom.save();

    res.json({
      success: true,
      message: "Room created successfully",
      room: newRoom
    });

  } catch (err) {
    console.error("Create room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------------------------------------------------
// ✅ 2️⃣ FETCH ROOMS + FULL DOGSTAY DETAILS (FIXED)
// ---------------------------------------------------------
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    console.log("USER ID RECEIVEDD:", userId);

    // ❗ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId format"
      });
    }

    // 1️⃣ Fetch real user using _id
    const user = await mongoose.connection
      .collection("users")
      .findOne({ _id: new mongoose.Types.ObjectId(userId) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2️⃣ Fetch booking rooms
    const bookingRooms = await BookingRoom.find({
      userId: user._id
    });

    // 3️⃣ Collect listing IDs
    const listingIds = bookingRooms.map(r => r.listingId);

    // 4️⃣ Fetch DogStay rooms
    const dogStays = await DogStay.find({
      _id: { $in: listingIds }
    });

    res.json({
      success: true,
      rooms: dogStays
    });

  } catch (err) {
    console.error("Fetch rooms error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});




// ✅ FETCH HOST CREATED ROOMS
router.get("/host/:hostId", async (req, res) => {
  try {
    const { hostId } = req.params;
    console.log("host ID RECEIVEDD:", hostId);

    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hostId"
      });
    }

    const rooms = await DogStay.find({
      hostId: new mongoose.Types.ObjectId(hostId)
    });

    // 🔹 Convert relative photo paths to full URLs
    const roomsWithFullPhotoURL = rooms.map(room => {
      const photos = room.photos.map(photo => `${req.protocol}://${req.get('host')}/${photo}`);
      return {
        ...room.toObject(),
        photos
      };
    });

    // ✅ Return the updated array with full URLs
    res.json({
      success: true,
      rooms: roomsWithFullPhotoURL
    });

  } catch (err) {
    console.error("Fetch host rooms error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ---------------------------------------------------------
// 3️⃣ DELETE ROOM (NO CHANGE)
// ---------------------------------------------------------
router.delete("/:listingId", async (req, res) => {
  try {
    const deleted = await BookingRoom.findOneAndDelete({
      listingId: req.params.listingId
    });

    if (!deleted) {
      return res.status(404).json({ message: "Room not found" });
    }

    res.json({
      success: true,
      message: "Room deleted successfully"
    });

  } catch (err) {
    console.error("Delete room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
