const express = require('express');
const authController = require('../controllers/authController');
const accountsController = require('../controllers/accountsController');

const router = express.Router();

router.post(
  '/search',
  authController.protect,
  authController.restrictTo('accounts','pomaker','pochecker','director'),
  accountsController.getAccountTableData
);

router.post(
  '/billingsearch',
  authController.protect,
  authController.restrictTo('billing','director','accounts','pochecker'),
  accountsController.getBillingTableData
);

router.post(
  "/items-by-mrv",
  authController.protect,
  authController.restrictTo('accounts','pomaker','pochecker','billing','director'),
  accountsController.getItemsByMrvIds
);

router.post(
  "/items-by-requisition",
  authController.protect,
  authController.restrictTo('accounts', 'pomaker', 'pochecker', 'billing', 'director'),
  accountsController.getItemsByRequisitionId
);

router.post(
  '/all-po-payment-table',
  authController.protect,
  accountsController.getAllPOPaymentTableData
);




module.exports = router;