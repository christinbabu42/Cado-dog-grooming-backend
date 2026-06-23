const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// -----------------------------------------------------------------------------
// ⭐ STEP 1: Redirect to Google
// -----------------------------------------------------------------------------
router.get("/", (req, res) => {
  req.session.loginType = req.query.loginType || "user";

  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";

  const options = {
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    client_id: process.env.GOOGLE_CLIENT_ID,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  };

  res.redirect(`${rootUrl}?${new URLSearchParams(options)}`);
});

// -----------------------------------------------------------------------------
// ⭐ STEP 2: Callback
// -----------------------------------------------------------------------------
router.get("/callback", async (req, res) => {
  const code = req.query.code;
  const loginType = req.session.loginType || "user";
  req.session.loginType = null;

  if (!code) return res.status(400).send("No code provided");

  try {
    // 🔄 Exchange token
    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // 👤 Get Google profile
    const googleUser = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${data.access_token}` } }
    );

    const googleData = googleUser.data;

    const googleId = googleData.sub;
    const email = googleData.email;

    const name =
      googleData.name ||
      `${googleData.given_name || ""} ${googleData.family_name || ""}`.trim();

    const picture = googleData.picture;

    if (!email || !name) {
      console.error("❌ Google user data incomplete:", googleData);
      return res.status(400).send("Google account data incomplete");
    }

    // -------------------------------------------------------------------------
    // ✅ CHANGE #1 — FIND USER BY EMAIL (ROOT FIX)
    // -------------------------------------------------------------------------
    let user = await User.findOne({ email });

    // 🚫 BLOCK SUSPENDED USERS
    if (user && user.status === "suspended") {
      return res.redirect(
        `${process.env.FRONTEND_URL}/login?error=ACCOUNT_SUSPENDED`
      );
    }

    // -------------------------------------------------------------------------
    // ✅ CREATE USER ONLY IF NOT EXISTS
    // -------------------------------------------------------------------------
    if (!user) {
      user = new User({
        name,
        email,
        googleId,
        profilePic: picture,
        phone: "",
        country: "",
        walletBalance: 0,
        role: loginType === "host" ? "host" : "owner",
        status: "active",
      });
      await user.save();
    } else {
      // ---------------------------------------------------------------------
      // ✅ CHANGE #2 — UPDATE GOOGLE ID ONLY IF MISSING
      // ---------------------------------------------------------------------
      if (!user.googleId) {
        user.googleId = googleId;
      }

      user.name = name;
      user.profilePic = picture;
      await user.save();
    }

    // -------------------------------------------------------------------------
    // ⭐ JWT TOKEN
    // -------------------------------------------------------------------------
    const token = jwt.sign(
      {
        mongoId: user._id.toString(),
        googleId: user.googleId,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Set HttpOnly cookie right after generating the JWT
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days matching token expiration
    });

    console.log("✅ LOGIN mongoId:", user._id.toString());
    console.log("✅ LOGIN googleId:", user.googleId);

    // -------------------------------------------------------------------------
    // 🔥 ROLE BASED REDIRECT (No longer passing tokens in URL strings)
    // -------------------------------------------------------------------------
    if (user.role === "admin" || user.role === "superadmin") {
      return res.redirect(`${process.env.FRONTEND_URL}/admin`);
    }

    if (user.role === "host") {
      return res.redirect(`${process.env.FRONTEND_URL}/HostDashboard`);
    }

    if (user.role === "owner") {
      return res.redirect(`${process.env.FRONTEND_URL}/Home`);
    }

    if (user.role === "gradmin") {
      return res.redirect(
        `${process.env.FRONTEND_URL}/admin/groomer-dashboard`
      );
    }

    if (user.role === "grstaff") {
      return res.redirect(
        `${process.env.FRONTEND_URL}/staff/earnings`
      );
    }

    return res.redirect(`${process.env.FRONTEND_URL}/Home`);

  } catch (err) {
    console.error("❌ Google Auth Error:", err.message);
    res.status(500).send("Authentication failed");
  }
});

module.exports = router;