const express = require('express');
const dashboard = require('../controllers/dashboardController')
const authController = require("../controllers/authController")
const router = express.Router();


router
  .route('/')
  .get(authController.protect,dashboard.getAllCount)
  router
  .route('/PO')
  .get(authController.protect,dashboard.getAllPOCount)

  router
  .route('/getitem')
  .post(authController.protect,dashboard.getDocumentWithItemsTest)

module.exports = router ;