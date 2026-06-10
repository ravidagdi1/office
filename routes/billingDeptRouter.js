const express = require('express');
const authController = require('../controllers/authController');
const billingDeptController = require('../controllers/billingDepartController')
const router = express.Router();


// Router to create new supppliers
router
  .route('/')
  .post(
  authController.protect,
  authController.restrictTo('pochecker', 'pomaker','superAdmin','billing'),
  billingDeptController.uploadProductPhoto,   // <- multer middleware
  billingDeptController.resizeProductPhoto,   // <- resize/save file
  billingDeptController.createBillingRecord   // <- your controller
).get(
    authController.protect,
    authController.restrictTo('pochecker', 'pomaker','superAdmin'),
    billingDeptController.getBillingDetailsWithPO 
  )

  router
    .route('/:status')
    .get(
    authController.protect,
    authController.restrictTo('pochecker', 'pomaker','superAdmin'),
    billingDeptController.getBillingDetailsWithPO 
  )

  router
    .route('/billing/:id')
    .get(authController.protect,authController.restrictTo('superAdmin'),billingDeptController.getBillingDetailsByPoId)
    .put(
    authController.protect,
    authController.restrictTo('superAdmin'),
    billingDeptController.billingApproval 
  )
    
  

  


module.exports = router;