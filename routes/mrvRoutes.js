const express = require('express');
const authController = require('../controllers/authController');
const mrvController = require('../controllers/mrvController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect, authController.restrictTo('admin', 'storeKeeper', 'superAdmin'), mrvController.getAllMrv)
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'), mrvController.uploadProductPhoto, mrvController.resizeProductPhoto, mrvController.createMrv);

router
  .route('/submitmrv')
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'), mrvController.submitMrv)

router
  .route('/localsubmitmrv')
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'), mrvController.submitMrvLocal)

router
  .route('/desile/submitmrv')
  .post(authController.protect, mrvController.submitDesile)

router
  .route('/submitTransferMrv')
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'), mrvController.submitTransferMrv)


router
  .route('/:id')
  .get(mrvController.getSingleMrv)
  .patch(authController.protect, authController.restrictTo('admin', 'storeKeeper'), mrvController.updateRequestItem)
  .delete(authController.protect, mrvController.deleteInventroyItem);

// ✅ New route for multiple billing numbers
router
  .route('/mrv-by-billing')
  .post(mrvController.getMrvByMultipleBillingNos);


router
  .route('/mrv/:id')
  .patch(authController.protect, authController.restrictTo('superAdmin','billing'), mrvController.uploadProductPhoto, mrvController.resizeProductPhoto, mrvController.updateMrv)
  .delete(authController.protect, authController.restrictTo('superAdmin'), mrvController.deleteMrv);

module.exports = router;