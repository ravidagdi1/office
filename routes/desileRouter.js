const express = require('express');
const authController = require('../controllers/authController');
const desileController = require('../controllers/desileController')
const router = express.Router();


router
  .route('/')
  .get(desileController.getAllDesileItem)
  .post(authController.protect ,desileController.submitRequistForDesile)

router
  .route('/adminapproved/desileitem')
  .get(desileController.getAdminApproveDesileItem)

router
  .route('/adminapproved/desileitem/:id')
  .patch(desileController.updateAdminApproveDesileItem)

router
  .route('/:id')
  .get(desileController.getDesileItem)
  .patch(authController.protect,desileController.updateDesileItem)
  .delete(desileController.deleteDesileItem)

  
  module.exports = router ;