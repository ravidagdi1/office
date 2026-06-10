const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  vehicle: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'AssetVehicle', // ✅ FIX
  required: true,
},
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
  },
  startKM: {
    type: Number,
    required: true,
  },
  endKM: {
    type: Number,
  },
  dieselOutReading: {
  type: Number,
  min: [0, 'Diesel reading cannot be negative'],
},
  status: {
    type: String,
    default: 'checkIn',
    enum: ['checkIn', 'checkOut'],
  },
  desile: [
    {
      desileQty: {
        type: Number,
      },
      dieselInReading: {
        type: Number,
        required: [true, 'Diesel reading is required'],
        min: [0, 'Diesel reading cannot be negative'],
      },
      reading: {
        type: Number,
      },
      diseleFilupDate: {
        type: Date,
      }
    }
  ],
  meterPhotos: {
    start: {
      type: String, // URL to the start meter photo
      required: true,
    },
    end: {
      type: String, // URL to the end meter photo
    },
  },
}, { timestamps: true });


attendanceSchema.pre(/^find/, function (next) {
   if (this.getOptions().skipPopulate) return next();

  this.populate({
    path: 'vehicle',
    populate: {
      path: 'asset',
      select: 'model equipmentNo serialNumber'
    }
  })
  .populate({
    path: 'driver',
    select: 'name'
  })
  .populate({
    path: 'store',
    select: 'name'
  });

  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);
