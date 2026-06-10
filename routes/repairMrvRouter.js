const express = require('express');
const authController = require('../controllers/authController');
const repairMrvController= require('../controllers/repairMrvController')
const router = express.Router();


router
    .route('/repair-mrv')
    .post(authController.protect,repairMrvController.uploadRepairMrvPhoto,repairMrvController.resizeRepairMrvPhoto,repairMrvController.createRepairMrv
)

router
.route('/repairmrv')
.get(authController.protect, repairMrvController.getAllRepairMrv);

router
  .route('/localsubmitmrv')
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'), repairMrvController.submitLocalRepairMrv)


  router
    .route('/submitmrv')
    .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'),repairMrvController.submitMrv)

{/*
router
  .route('/submitmrv')
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'), mrvController.submitMrv)

router
  .route('/localsubmitmrv')
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper'), mrvController.submitMrvLocal)

  */}

module.exports = router;