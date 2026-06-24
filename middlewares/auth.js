// middlewares/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    console.log("========== AUTH DEBUG ==========");
    console.log("Cookies:", req.cookies);
    console.log("Token:", req.cookies?.token);
    console.log("Token from Headers:", req.headers.authorization);
    console.log("================================");
    
    // ----------------------------------
    // 🔑 Get token from Cookie OR fall back to Authorization Header
    // ----------------------------------
    let token = req.cookies ? req.cookies.token : null;

    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // ----------------------------------
    // 🔐 Verify token
    // ----------------------------------
    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({
        message: "Invalid or missing token"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ----------------------------------
    // 👤 Support both mongoId and _id
    // ----------------------------------
    const userId = decoded.mongoId || decoded._id || decoded.id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid token payload"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        message: "User not found"
      });
    }

    // ----------------------------------
    // 🚫 BLOCK SUSPENDED USERS
    // ----------------------------------
    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Your account has been suspended. Please contact support."
      });
    }

    // ----------------------------------
    // ⭐ Attach safe user info to request
    // ----------------------------------
    req.user = {
      mongoId: user._id,
      role: user.role,
      email: user.email,
      name: user.name
    };

    next();

  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(401).json({
      message: "Token is not valid"
    });
  }
};