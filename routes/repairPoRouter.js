const express = require('express');
const authController = require('../controllers/authController');
const repairPoController = require('../controllers/repairPoController')
const router = express.Router();



router
  .route('/pendingPoList')
  .get(authController.protect, repairPoController.getPendingPOItemDetails)

  router
    .route('/RepairOrder')
   // .get(authController.protect, poController.allPurchaseOrder)
    .post(authController.protect,authController.restrictTo('director', 'pomaker', 'pochecker','storeKeeper'), repairPoController.createRepairPO)

 router
   .route('/PurchaseOrder/status')
   .get(authController.protect, authController.restrictTo('pochecker', 'pomaker', 'admin', 'superAdmin', 'billing', 'accounts','storeKeeper','director'),repairPoController.repairPOByStatus)
 

router
  .route('/approvePO')
  .post(authController.protect, authController.restrictTo('director', 'pomaker', 'pochecker'), repairPoController.approveRepairPO)


  router
    .route('/purchase-orders/:id')
    .put(authController.protect, authController.restrictTo('director', 'pomaker', 'pochecker'),repairPoController.updateRepairPO)
  

    router
      .route('/po-items')
      .get(authController.protect, repairPoController.AllRepairItemsByPoId)

module.exports = router;