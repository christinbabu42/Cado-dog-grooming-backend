const express = require("express");
const router = express.Router();
const BookingRoom = require("../models/BookingRoom");
const Transaction = require("../models/Transaction");
const auth = require("../middlewares/auth");
const GroomerBooking = require("../models/GroomerBooking");
const DogStay = require("../models/DogStay");

// ========================================================================
// 🔒 Get all payments (DogStay + Groomer) - ADMIN ONLY
// ========================================================================
router.get("/all-payments", auth, async (req, res) => {
  try {
    // Basic structural authorization safety check for admin role parity
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied. Admins only." });
    }

    const dogstayBookings = await BookingRoom.find()
      .populate("userId", "name email")
      .populate("listingId", "roomName")
      .populate("hostId", "name email")
      .sort({ createdAt: -1 });

    const groomerBookings = await GroomerBooking.find()
      .sort({ createdAt: -1 });

    const combined = [
      ...dogstayBookings.map(b => ({
        _id: b._id,
        fullName: b.userId?.name || b.fullName || "N/A",
        roomName: b.listingId?.roomName || b.roomName || "DogStay",
        totalAmount: b.totalAmount || 0,
        paymentMethod: b.paymentMethod || "N/A",
        paymentStatus: b.bookingStatus || b.paymentStatus || "pending",
        createdAt: b.createdAt
      })),
      ...groomerBookings.map(b => ({
        _id: b._id,
        fullName: b.name || "N/A",
        roomName: b.service || "Grooming",
        totalAmount: b.price || 0,
        paymentMethod: b.paymentMethod || "N/A",
        paymentStatus: b.paymentStatus || "pending",
        createdAt: b.createdAt
      }))
    ];

    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, bookings: combined });

  } catch (err) {
    console.error("Error fetching all payments:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ========================================================================
// 🟢 Create a new booking (STRICT WHITELIST + SECURE VALUE VALIDATION)
// ========================================================================
router.post("/", auth, async (req, res) => {
  try {
    const {
      listingId,
      checkInDate,
      checkOutDate,
      numDogs,
      fullName,
      email,
      mobile,
      paymentMethod
    } = req.body;

    if (!listingId || !checkInDate || !checkOutDate || !fullName || !email || !mobile) {
      return res.status(400).json({ success: false, message: "Missing required booking details." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email address format." });
    }

    // 🛡️ FIX: Cast to explicit string prior to evaluation to handle numeric inputs gracefully
    const cleanMobile = String(mobile).replace(/[^\d]/g, "");
    if (cleanMobile.length < 10 || cleanMobile.length > 15) {
      return res.status(400).json({ success: false, message: "Invalid mobile number formatting context." });
    }

    const parsedNumDogs = Number(numDogs);
    if (isNaN(parsedNumDogs) || parsedNumDogs < 1 || parsedNumDogs > 10) {
      return res.status(400).json({ success: false, message: "Dog capacity count must fall between 1 and 10." });
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return res.status(400).json({ success: false, message: "Provided dates possess invalid formatting." });
    }

    // 🛡️ FIX: Lock down system against processing retroactive reservation timestamps
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkIn < today) {
      return res.status(400).json({ success: false, message: "Check-in configuration cannot execute in past contexts." });
    }

    if (checkOut <= checkIn) {
      return res.status(400).json({ success: false, message: "Check-out date must succeed check-in date." });
    }

    const room = await DogStay.findById(listingId);
    if (!room) {
      return res.status(404).json({ success: false, message: "DogStay room profile not found." });
    }

    const pricePerDay = Number(room.pricePerDay);
    // 🛡️ FIX: Safeguard calculation matrix against propagation of invalid pricing values
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      return res.status(400).json({ success: false, message: "Room configuration contains processing errors." });
    }

    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    const fakePricePerDay = Math.round(pricePerDay * 1.20);
    const userPricePerDay = Math.round(pricePerDay * 0.90);
    const websiteCommissionPerDay = Math.round(pricePerDay * 0.10);
    const hostPricePerDay = Math.round(pricePerDay * 0.80);

    const totalAmount = userPricePerDay * nights;

    const pricingBreakup = { fakePricePerDay, userPricePerDay, websiteCommissionPerDay, hostPricePerDay };
    const totals = { nights, totalCommission: websiteCommissionPerDay * nights, totalHostEarning: hostPricePerDay * nights };

    const newBooking = new BookingRoom({
      userId: req.user.id,
      hostId: room.hostId,
      listingId: room._id,
      roomName: room.roomName,
      checkInDate,
      checkOutDate,
      numDogs: parsedNumDogs,
      fullName,
      email,
      mobile: cleanMobile,
      paymentMethod: paymentMethod || "Card",
      pricePerDay,
      totalAmount,
      pricingBreakup,
      totals,
      bookingStatus: "pending"
    });

    const savedBooking = await newBooking.save();
    res.status(201).json({ success: true, message: "Booking created successfully", booking: savedBooking });

  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});


// ========================================================================
// 🔒 Get All Bookings (Admin) - SECURED
// ========================================================================
router.get("/all", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const bookings = await BookingRoom.find()
      .populate("userId", "name email")
      .populate("hostId", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    console.error("Fetch Booking Error:", error);
    res.status(500).json({ success: false, message: "Failed to load bookings" });
  }
});


// ========================================================================
// 🔒 Get Single Booking By ID - SECURED AGAINST DIRECT ENUMERATION
// ========================================================================
router.get("/:id", auth, async (req, res) => {
  try {
    const booking = await BookingRoom.findById(req.params.id)
      .populate("userId", "name email")
      .populate("hostId", "name email");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // Verify requesting account owns this singular document profile or has admin status
    if (booking.userId?._id.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized viewing window parameters." });
    }

    res.json({ success: true, booking });
  } catch (error) {
    console.error("Fetch Booking Error:", error);
    res.status(500).json({ success: false, message: "Failed to load booking" });
  }
});


// ========================================================================
// 🔒 Update booking status + SAFE COMMISSION LOGIC - ADMIN ONLY
// ========================================================================
router.put("/:id/status", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { status, payment_id } = req.body;
    const booking = await BookingRoom.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    booking.bookingStatus = status || booking.bookingStatus;
    if (payment_id) booking.paymentId = payment_id;

    await booking.save();

    if (status === "paid") {
      const totalAmount = booking.totalAmount || 0;
      const commissionAmount = booking.totals?.totalCommission ?? Math.round(totalAmount * 0.10);
      const hostEarning = booking.totals?.totalHostEarning ?? Math.round(totalAmount * 0.90);

      await new Transaction({
        booking_id: booking._id,
        user_id: booking.userId,
        amount: totalAmount,
        type: "debit",
        remarks: "Customer payment for DogStay booking",
      }).save();

      await new Transaction({
        booking_id: booking._id,
        user_id: booking.hostId,
        amount: hostEarning,
        type: "credit",
        remarks: "Host earning after platform commission",
      }).save();

      await new Transaction({
        booking_id: booking._id,
        user_id: null,
        amount: commissionAmount,
        type: "commission",
        remarks: "Platform commission fee",
      }).save();
    }

    res.json({ success: true, message: "Booking updated", booking });
  } catch (err) {
    console.error("Error updating booking status:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ========================================================================
// 🔒 Delete booking - ADMIN ONLY
// ========================================================================
router.delete("/delete/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const booking = await BookingRoom.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    await BookingRoom.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Booking deleted successfully" });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;