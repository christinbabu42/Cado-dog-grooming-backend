const mongoose = require('mongoose');

const dogStaySchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roomName: { type: String, required: true },
  shortDescription: { type: String, required: true },
  photos: [String],
  video: String,
  ownerFullName: { type: String, required: true },
  contactNumber: { type: String, required: true },
  emailAddress: String,
  idProof: String,
  fullAddress: { type: String, required: true },
  pinCode: { type: String, required: true },
  googleMapsLink: String,
    // ✅ NEW: MAP LOCATION (Latitude & Longitude)
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  pricePerDay: { type: Number, required: true },
  additionalPetCharge: Number,
  availableFrom: String,
  availableTo: String,
  minimumStay: Number,
  refundPolicy: String,
  amenities: [String],
  foodProvided: String,
  groomingService: String,
  playArea: String,
  vetOnCall: String,
  stayType: String,
  allowedSizes: [String],
  weightLimit: Number,
  breedRestrictions: String,
  vaccinationRequired: String,
  checkInTime: String,
  checkOutTime: String,
  rulesGuidelines: String,
  isApproved: { type: Boolean, default: false },
  isRejected: { type: Boolean, default: false },
  termsConfirmed: { type: Boolean, required: true },
}, { timestamps: true });

dogStaySchema.pre('save', function (next) {
  if (this.isApproved && this.isRejected) {
    this.isRejected = false;
  }
  next();
});

module.exports = mongoose.model('DogStay', dogStaySchema);
