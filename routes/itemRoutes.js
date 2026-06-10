const express = require('express');
const authController = require('../controllers/authController');
const itemController = require('../controllers/itemController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect, authController.restrictTo('admin', 'storeKeeper', 'superAdmin','director'), itemController.getAllItem)
  .post(authController.protect, authController.restrictTo('admin', 'storeKeeper', 'superAdmin'), itemController.uploadProductPhoto, itemController.resizeProductPhoto, itemController.createItem);

router
  .route('/request/:requisitionNo')
  .get(authController.protect, authController.restrictTo('admin', 'storeKeeper', 'superAdmin','pomaker'), itemController.getItemsByRequisitionNo)


router
  .route('/report')
  .post(authController.protect, authController.restrictTo('superAdmin', 'pomaker', 'pochecker'), itemController.getItemsByStoreStatusDate)



   router
    .route('/report/download')
    .post( authController.protect,authController.restrictTo('superAdmin'), itemController.downloadRequisitionReport);
  
router
  .route('/desile/item')
  .get(authController.protect, itemController.getdesileItem)

router
  .route('/getallitem/item')
  .get(authController.protect, itemController.getAllItemforApproval)

router
  .route('/itemreport')
  .post(authController.protect, authController.restrictTo('superAdmin', 'pomaker', 'pochecker'), itemController.getRequestItemsByStoreStatusDate)


router
  .route('/director/bulk-approve')
  .patch(authController.protect, authController.restrictTo('director'), itemController.bulkApproveByDirector);

  router
  .route('/director/update-status/:id')
  .patch(
    authController.protect,
    authController.restrictTo('director','superAdmin'),
    itemController.updateItemStatusByDirector
  );

  router
  .route('/update-approve-qty/:id')
  .patch(
  authController.protect,                 // 🔐 user must be logged in
  authController.restrictTo('director','superAdmin'), // ✅ only director allowed
  itemController.updateApproveQtyByDirector
);

router
.route("/bypass/:id")
.patch(
  authController.protect,
  authController.restrictTo("director"), // only director
  itemController.bypassByRequisitionStatus
);

router
  .route('/:id')
  .get(authController.protect, itemController.getInventoryItem)
  .patch(authController.protect, authController.restrictTo('admin', 'superAdmin','director'), itemController.updateRequestItem)
  .delete(authController.protect, authController.restrictTo('admin', 'superAdmin'), itemController.deleteInventroyItem);

router
  .route('/qty/:id')
  .put(authController.protect, authController.restrictTo('superAdmin', 'pomaker'), itemController.updateQtyItem)

router
  .route('/:id/cancel-remaining')
  .patch(
    authController.protect,
    authController.restrictTo('superAdmin','pochecker','pomaker'),
    itemController.cancelRemainingItem
  );



module.exports = router;