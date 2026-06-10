const express = require('express');
const authController = require('../controllers/authController');
const poController = require('../controllers/poController')
const router = express.Router();


// Router to create new supppliers
router
  .route('/')
  .post(
    authController.protect,
    authController.restrictTo('pochecker', 'pomaker', 'superAdmin'),
    poController.createNewSupplier
  )
  .get(
    authController.protect,
    authController.restrictTo('pochecker', 'pomaker', 'superAdmin', 'storeKeeper', 'billing', 'accounts','director'),
    poController.activeSuppliers
  );


// id based router

// ===================================
// ✅ DASHBOARD PO (FAST API)
// ===================================
router
.route('/dashboardPoData')
.get(authController.protect,poController.getAllPODashboardData );

router
  .route('/:id')
  //.get(authController.protect,storeController.getStoreById)
  .put(authController.protect, authController.restrictTo('poAdmin', 'pomaker', 'admin', 'superAdmin', 'storeKeeper'), poController.updateSupplierById)
  .delete(authController.protect, authController.restrictTo('poAdmin', 'pomaker', 'admin', 'superAdmin', 'storeKeeper'), poController.updateSupplierById);


  router
  .route('/po-items/:requestId')
  .get(authController.protect, authController.restrictTo('poAdmin', 'pomaker', 'admin', 'superAdmin', 'storeKeeper'),poController.getPOItemsByRequestId);

router
  .route('/inactive')
  .get(authController.protect, poController.inactiveSuppliers)

router
  .route('/pendingPo')
  .get(authController.protect, poController.getPendingPOItemDetails)

  router
    .route('/report/download')
    .post( authController.protect,authController.restrictTo('superAdmin','pomaker','pochecker'), poController.downloadPendingPOReport);
  

router
  .route('/purchase-orders/:id')
  .put(authController.protect, poController.updatePO)

router
  .route('/PurchaseOrder')
  .get(authController.protect, poController.allPurchaseOrder)
  .post(authController.protect, poController.createPO)


router
  .route('/PurchaseOrder/status')
  .get(authController.protect, authController.restrictTo('pochecker', 'pomaker', 'admin', 'superAdmin', 'billing', 'accounts','director'), poController.purchaseOrderByStatus)

router
  .route('/po-items')
  .get(authController.protect, poController.AllItemsByPoId)

  router
  .route('/report/po-by-status')
  .get(authController.protect, poController.getPoWithItemsByStatus)

   router
  .route('/report/by-created-date')
  .post(authController.protect, authController.restrictTo('superAdmin','pomaker', 'pochecker'),poController.getPoByCreatedDateRange)

router
  .route('/approvePO')
  .post(authController.protect, authController.restrictTo('superAdmin', 'pomaker', 'pochecker','director'), poController.approvePO)



router
  .route("/superadmin/billing-action")
  .patch(authController.protect, authController.restrictTo('superAdmin'), poController.superAdminBillingAction
  )


router
  .route('/superadmin/billing-bulk')
  .patch(authController.protect, authController.restrictTo('superAdmin'), poController.superAdminBillingBulkAction);


  router
  .route('/po-by-id/:poId')   // ✅ UNIQUE (no clash)
  .get(
    authController.protect, authController.restrictTo('accounts','pomaker','pochecker','billing','director'),
    poController.getPOById
  );

module.exports = router;