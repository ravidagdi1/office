const mongoose = require("mongoose");

const stateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true, // To avoid duplicate state names
    trim: true,
  },
});

module.exports = mongoose.model("State", stateSchema);
