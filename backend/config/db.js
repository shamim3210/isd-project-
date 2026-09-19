const mongoose = require("mongoose");

// MongoDB connection string.
// Local MongoDB:      mongodb://127.0.0.1:27017/libraryms
// MongoDB Atlas (cloud, free tier): mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/libraryms
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/libraryms";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
