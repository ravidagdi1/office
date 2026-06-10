const express = require('express');
const authController = require('../controllers/authController');
const CastingController = require('../controllers/castingController')
const router = express.Router();



router
  .route('/')
  .post( authController.protect, CastingController.createCasting);

  router
  .route('/report')
  .get(authController.protect, CastingController.requstionImage)
  .post(authController.protect, CastingController.CastingReport);

  // Casting digital
  router
  .route('/digitalreport')
  .post(authController.protect, CastingController.CastingDigitalForm)

// Add this for deleting by filename
router
  .route('/report/:filename')
  .delete(authController.protect, CastingController.deleteRequisitionImage);

  router
  .get('/report/download-images', authController.protect, CastingController.downloadAllImages);

module.exports = router ;