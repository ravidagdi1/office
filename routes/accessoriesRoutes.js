const express = require('express');
const authController = require('../controllers/authController');
const accessoriesController = require('../controllers/accessoriesController');

const router = express.Router();

router
  .route('/')
  .get(authController.protect,accessoriesController.getAllAccessories)
  .post(authController.protect,accessoriesController.createAccessory);

  
router
  .route('/:id')
  .get(accessoriesController.getAccessoryById)
  .patch(accessoriesController.updateAccessory)
  .delete(accessoriesController.deleteAccessory);

module.exports = router;
