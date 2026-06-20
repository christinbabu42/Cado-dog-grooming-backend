// 🐶 adminRoutes.js — Backend API Routes for DogStay Admin
// ==========================================================

const express = require('express');
const multer = require('multer');
const path = require('path'); // For reliable file path operations
const router = express.Router();

// 1. 🛑 FIX: Change the first import to the standard synchronous 'fs'
const fs = require('fs'); 
// 2. 🟢 Add the promise-based version with an alias for async operations
const fsPromises = require('fs/promises'); 

// ======================= Model Imports ======================= //
// NOTE: These models must be correctly defined and exported in their respective files.
const User = require('../models/User');
const Listing = require('../models/Listing');
const BookingRoom = require('../models/BookingRoom');
const Payment = require('../models/Payment');
const DogStay = require('../models/DogStay');

// ======================= Multer Setup ======================= //

// Define uploads folder path (cross-platform safe)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Multer requires synchronous methods, which are available on the 'fs' module.
        if (!fs.existsSync(UPLOADS_DIR)) { // 💡 THIS NOW WORKS
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const fileExtension = path.extname(file.originalname);
        cb(null, uniqueSuffix + fileExtension);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 5 } // 5MB per file
});

// ==========================================================
// 📊 EXISTING ADMIN CRUD ROUTES (Unchanged Mock Data)
// ==========================================================

// 1️⃣ Get Dashboard Stats
router.get('/stats', async (req, res) => {
    // NOTE: Replace mock data with actual data fetching logic from all models
    res.status(200).json({ totalListings: 100, bookingsToday: 5, activeUsers: 50, revenueMonth: 500000, avgRating: 4.5 });
});

// 2️⃣ Users CRUD - Read All
router.get('/users', async (req, res) => {
    // NOTE: Add actual Mongoose logic here, e.g., const users = await User.find().select('-password');
    res.status(200).json({ success: true, data: [] });
});

// 3️⃣ Listings CRUD - Read All
router.get('/listings', async (req, res) => {
    // NOTE: This route should use the generic Listing model if you have one, otherwise ignore.
    res.status(200).json({ success: true, data: [] });
});

// 4️⃣ Bookings - Read All
router.get('/bookings', async (req, res) => {
    res.status(200).json({ success: true, data: [] });
});

// 5️⃣ Payments - Read All
router.get('/payments', async (req, res) => {
    res.status(200).json({ success: true, data: [] });
});



// Example (adminRoutes.js)
router.get('/approved-listings', async (req, res) => {
  try {
    const approvedRooms = await DogStay.find({ isApproved: true }); // assuming you have a field `isApproved`
    res.json(approvedRooms);
  } catch (err) {
    console.error('Error fetching approved listings:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});





// ==========================================================
// 🏡 DOGSTAY ROUTES
// ==========================================================

// ✅ POST DogStay (Create Listing + File Upload)
router.post(
    '/dogstay',
    upload.fields([
        { name: 'photos', maxCount: 5 },
        { name: 'video', maxCount: 1 },
        { name: 'idProof', maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const files = req.files;
            const data = req.body;

// Parse JSON fields
['location', 'amenities', 'allowedSizes'].forEach(field => {
  if (data[field] && typeof data[field] === 'string') {
    try {
      data[field] = JSON.parse(data[field]);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: `Invalid JSON format for ${field}`,
        error: e.message
      });
    }
  }
});

// In your POST /dogstay route, after getting `data = req.body`:
if (data.location && typeof data.location === 'string') {
  try {
    data.location = JSON.parse(data.location);
  } catch (err) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid JSON format for location',
      error: err.message
    });
  }
}

// ✔️ USE hostId coming from frontend
if (!data.hostId) {
  return res.status(400).json({
    success: false,
    message: "hostId missing. Login again."
  });
}

            // -----------------------------------------------

            // ---------- DEBUG LOGS ----------
            console.log('--- DOGSTAY POST START ---');
            console.log('Received Body Data:', data);
            console.log('Received Files:', files);
            
            // 🔥 CRITICAL DEBUG: Check the absolute path of the uploaded file
            if (files.photos && files.photos.length > 0) {
                console.log('--- DEBUG: Multer saved file path ---');
                console.log('Absolute path:', files.photos[0].path);
                console.log('-------------------------------------');
            }

            // --- Parse JSON fields (if sent as strings) ---
            ['amenities', 'allowedSizes'].forEach(field => {
                if (data[field] && typeof data[field] === 'string') {
                    try {
                        data[field] = JSON.parse(data[field]);
                    } catch (e) {
                        console.error(`JSON Parse Error for ${field}:`, e.message);
                        return res.status(400).json({
                            success: false,
                            message: `Invalid JSON format for ${field}`,
                            error: e.message
                        });
                    }
                }
            });

            // --- CRITICAL FIX 2: Handle empty strings for Number fields ---
            ['pricePerDay', 'additionalPetCharge', 'minimumStay', 'weightLimit'].forEach(field => {
                if (data[field] === '') {
                    // Remove the property entirely
                    delete data[field]; 
                } else if (data[field]) {
                    // Explicitly convert to number, as Multer body fields are strings
                    data[field] = Number(data[field]);
                }
            });


            // --- Convert 'termsConfirmed' to boolean ---
            if (data.termsConfirmed !== undefined) {
                // 'true' (string) -> true (boolean), everything else (including 'false') -> false
                data.termsConfirmed = data.termsConfirmed === 'true'; 
            }

            // --- Normalize file paths for Mongoose/client ---
            // We strip the absolute path and keep only the relative path and filename.
            const relativeUploadPath = 'uploads/';

            if (files.photos) {
                data.photos = files.photos.map(f => relativeUploadPath + path.basename(f.path));
            }
            if (files.video) {
                data.video = relativeUploadPath + path.basename(files.video[0].path);
            }
            if (files.idProof) {
                data.idProof = relativeUploadPath + path.basename(files.idProof[0].path);
            }

            // ---------- DEBUG FINAL DATA ----------
            console.log('Final Data for Mongoose:', data);

            // --- Save DogStay Listing ---
            const newListing = new DogStay(data);
            const savedListing = await newListing.save();

            console.log('--- DOGSTAY POST SUCCESS ---');
            res.status(201).json({
                success: true,
                message: 'DogStay listing created successfully',
                data: savedListing
            });
        } catch (err) {
            console.error('!!! CRITICAL ERROR: DogStay POST failed !!!');
            console.error('Full Error Object:', err);

            if (err.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'Validation Error: Check required fields or data types.',
                    error: err.message,
                    details: err.errors
                });
            }

            res.status(500).json({
                success: false,
                message: 'Server Error creating DogStay listing (Check server console for details)',
                error: err.message
            });
        }
    }
);

// ✅ GET DogStay Listings (Read All)
router.get('/dogstay', async (req, res) => {
    try {
        const listings = await DogStay.find()
            .populate('hostId', 'name email') 
            .sort({ createdAt: -1 })
            .select('-__v');

        // ---------- DEBUG LOGS ----------
        console.log('--- DEBUG: DogStay listings fetched ---');
        if (listings.length > 0) {
            console.log(`Successfully fetched ${listings.length} listings.`);
            console.log('First Listing Example:', listings[0]);
        } else {
            console.log('No DogStay listings found in the database.');
        }
        console.log('-------------------------------------------');

        res.status(200).json({ success: true, data: listings });
    } catch (err) {
        console.error('Error fetching DogStay listings:', err);
        res.status(500).json({
            success: false,
            message: 'Server Error retrieving DogStay listings',
            error: err.message
        });
    }
});

// ❌ NEW ROUTE: DELETE DogStay Listing by ID (Fixes "Route Not Found" error)
router.delete('/dogstay/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Find the listing to get file paths for cleanup
        const listingToDelete = await DogStay.findById(id);

        if (!listingToDelete) {
            return res.status(404).json({ success: false, message: `Listing with ID ${id} not found.` });
        }
        
        // 2. Perform the permanent deletion from MongoDB
        await DogStay.findByIdAndDelete(id);

        // 3. Optional: Delete associated files (photos, idProof) from the filesystem
        const filesToUnlink = [];

        // Add photos paths
        if (listingToDelete.photos && listingToDelete.photos.length > 0) {
            listingToDelete.photos.forEach(filePath => {
                // Remove the 'uploads/' prefix to get the filename
                const filename = path.basename(filePath); 
                filesToUnlink.push(path.join(UPLOADS_DIR, filename));
            });
        }

        // Add ID Proof path
        if (listingToDelete.idProof) {
            const filename = path.basename(listingToDelete.idProof);
            filesToUnlink.push(path.join(UPLOADS_DIR, filename));
        }

        // Execute file deletions (asynchronously, ignoring errors for non-existent files)
        const unlinkPromises = filesToUnlink.map(filePath => 
            fsPromises.unlink(filePath).catch(err => { // 💡 USING fsPromises HERE
                if (err.code !== 'ENOENT') { // ENOENT means "Error NO ENTry" (file not found), which is okay.
                    console.warn(`Warning: Could not delete file ${filePath}. Error: ${err.message}`);
                }
            })
        );
        await Promise.all(unlinkPromises);
        
        // 4. Send success response
        console.log(`--- DOGSTAY DELETE SUCCESS: Listing ${id} deleted, files cleaned up. ---`);
        res.status(200).json({
            success: true,
            message: `Listing ${id} and associated files permanently deleted.`,
            deletedId: id
        });

    } catch (err) {
        console.error('!!! CRITICAL ERROR: DogStay DELETE failed !!!');
        console.error('Full Error Object:', err);
        
        if (err.name === 'CastError' && err.kind === 'ObjectId') {
            return res.status(400).json({ success: false, message: 'Invalid Listing ID format.' });
        }

        res.status(500).json({
            success: false,
            message: 'Server Error deleting DogStay listing (Check server console for details)',
            error: err.message
        });
    }
});


// ==========================================================
// ✅ Export Router
// ==========================================================
module.exports = router;