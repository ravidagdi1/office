const express = require('express');
const authController = require('../controllers/authController');
const requestController = require('../controllers/requestController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,requestController.getAllRequest)
  .post( authController.protect,authController.restrictTo('superAdmin','admin','storeKeeper'),requestController.uploadProductPhoto,requestController.resizeProductPhoto, requestController.createRequest);
  
  router
  .route('/allstatus')
  .get(authController.protect,requestController.getAllStatusRequest)

  router
  .route('/dashboard-data')
  .get(authController.protect,requestController.getAllRequestDashboradData)


router
  .route('/submitrequisition')
  .post(authController.protect,authController.restrictTo('admin','storeKeeper'),requestController.submitRequist)
router
  .route('/newSubmitrequisition')
  .post(authController.protect,authController.restrictTo('admin','storeKeeper'),requestController.newSubmitRequist)

router
  .route('/superadmin/create-priority-requisition')
  .post(authController.protect,authController.restrictTo('superAdmin'),requestController.newSubmitRequistBySuperAdmin)


router
  .route('/submitfordesile')
  .post(authController.protect,requestController.submitRequistForDesile)



  router
  .route('/return-to-admin')
  .patch(authController.protect,authController.restrictTo('director','superAdmin'),requestController.returnToAdminByDirector)
  
router
.route('/stores-from-requests')
.get(authController.protect,authController.restrictTo('director','superAdmin'),requestController.getStoresFromRequests);

router
  .route('/:id')
  .get(requestController.getInventoryItem)
  .patch(authController.protect,authController.restrictTo('superAdmin','admin','storeKeeper'),requestController.updateRequestItem)
  .delete(authController.protect,authController.restrictTo('superAdmin'),requestController.deleteInventroyItem);

module.exports = router ;