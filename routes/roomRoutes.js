const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');

// GET all rooms
router.get('/', async (req, res) => {
  try {
    const listings = await Listing.find().populate('hostId', 'name email');
    res.json(listings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST new room
router.post('/', async (req, res) => {
  const { hostId, title, location, pricePerNight } = req.body;
  const newListing = new Listing({ hostId, title, location, pricePerNight });
  try {
    const savedListing = await newListing.save();
    res.status(201).json(savedListing);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
