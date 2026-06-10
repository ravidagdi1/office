const mongoose = require('mongoose');

const rateChartSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterList', // reference MasterList
      required: [true, 'Item is required'],
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuppliersDetails', // reference Supplier
      required: [true, 'Supplier is required'],
    },
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
    },
    status: {
      type: String,
      enum: ['New', 'Approved'],
      default: 'New',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// Automatically populate item and supplier info on queries
rateChartSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'item',
    select: 'partNo description category subCategory unit',
  }).populate({
    path: 'supplier',
    select: 'name contactPerson address mobileNo email GSTNo',
  });
  next();
});

const RateChart = mongoose.model('RateChart', rateChartSchema);

module.exports = RateChart;
