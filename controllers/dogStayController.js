// controllers/dogStayController.js

const DogStay = require('../models/DogStay');

// ... other controller functions (getListings, createListing, etc.)

// NEW FUNCTION: deleteListing
const deleteDogStayListing = async (req, res) => {
    try {
        const { id } = req.params; // Get the ID from the URL parameter

        // 1. Find the listing by ID and delete it
        const result = await DogStay.findByIdAndDelete(id);

        // 2. Check if the listing was actually found and deleted
        if (!result) {
            return res.status(404).json({ success: false, message: 'Listing not found.' });
        }

        // 3. Send a success response
        res.status(200).json({ 
            success: true, 
            message: `Listing with ID ${id} permanently deleted.`,
            deletedListing: result // Optional: send back the deleted document
        });

    } catch (error) {
        console.error("Error during listing deletion:", error);
        // Handle potential Mongoose CastError (e.g., invalid ID format)
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ success: false, message: 'Invalid Listing ID format.' });
        }
        res.status(500).json({ success: false, message: 'Server error during deletion.', error: error.message });
    }
};

module.exports = {
    // ... export other functions
    deleteDogStayListing
};