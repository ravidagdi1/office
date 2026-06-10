const express = require('express');
const authController = require('../controllers/authController');
const AttendanceController = require('../controllers/attendanceController');

const router = express.Router();
// ✅ CHECK IN
router.route('/checkIn').post(
  authController.protect,
  authController.restrictTo('MachineOperator'),
  AttendanceController.uploadAttendancePhoto,   // ✅ UPDATED
  AttendanceController.resizeAttendancePhoto,   // ✅ UPDATED
  AttendanceController.checkIn
);

// ✅ CHECK OUT
router.route('/checkOut').post(
  authController.protect,
  authController.restrictTo('MachineOperator'),
  AttendanceController.uploadAttendancePhoto,   // ✅ SAME MIDDLEWARE
  AttendanceController.resizeAttendancePhoto,   // ✅ SAME MIDDLEWARE
  AttendanceController.checkOut
);

// ✅ DIESEL FILL UP (no image needed → remove upload ❗)
router.route('/desilefileUp').post(
  authController.protect,
  authController.restrictTo('MachineOperator'),
  AttendanceController.addDieselFillUp
);

// OTHER ROUTES (unchanged)
router.route('/:id')
  .get(authController.protect, authController.restrictTo("superAdmin"), AttendanceController.getAttendanceById)
  .put(authController.protect, authController.restrictTo("superAdmin"), AttendanceController.updateAttendanceById)
  .delete(authController.protect, authController.restrictTo("superAdmin"), AttendanceController.deleteAttendanceById);

router.route('/vehicle/:vehicleId')
  .get(authController.protect, AttendanceController.getAttendanceByVehicle);

router.route('/driver/:driverId')
  .get(authController.protect, AttendanceController.getAttendanceByDriver);

router.route('/my/attendance')
  .get(authController.protect, AttendanceController.getMyAttendance);

router.route('/report')
  .post(authController.protect, authController.restrictTo('superAdmin'), AttendanceController.getAttendenceByDate);

router.route('/pdfreport')
  .post(authController.protect, authController.restrictTo('superAdmin'), AttendanceController.getAttendenceByDatePdf);

module.exports = router;