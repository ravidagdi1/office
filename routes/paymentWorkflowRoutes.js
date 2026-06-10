const express = require("express");
const router = express.Router();
const authController = require('../controllers/authController');
const paymentWorkflowController = require("../controllers/paymentWorkflowController");

// 🔥 Billing Approve
router.post(
    "/billing-approve",
    authController.protect, authController.restrictTo('billing'),
    paymentWorkflowController.uploadBillingDocs,
    paymentWorkflowController.processBillingDocs,
    paymentWorkflowController.billingApprove
);

// 🔥 NEW → UPDATE BILLING DETAILS (ADD THIS)
router.patch(
    "/update-billing",
    authController.protect,
    authController.restrictTo('billing'),
    paymentWorkflowController.updateBillingDetails
);

router.get(
    "/history/:poId",
    authController.protect,
    paymentWorkflowController.getBillingHistory
);

// ✅ BULK FIRST
router.patch("/ho-approve", authController.protect, authController.restrictTo('director'), paymentWorkflowController.hoApprove);
router.patch("/ho-send-back", authController.protect, authController.restrictTo('director'), paymentWorkflowController.hoSendBack);

// ✅ SINGLE AFTER
router.patch("/ho-approve/:id", authController.protect, authController.restrictTo('director'), paymentWorkflowController.hoApprove);
router.patch("/ho-send-back/:id", authController.protect, authController.restrictTo('director'), paymentWorkflowController.hoSendBack);

// 💰 Accounts Payment
router.patch(
    "/mark-payment-paid",
    authController.protect,
    authController.restrictTo('accounts'),
    paymentWorkflowController.markPaymentPaid);

router.patch(
    "/accounts-send-back",
    authController.protect,
    authController.restrictTo('accounts'),
    paymentWorkflowController.accountsSendBack
);




router.patch(
    "/po-approve",
    authController.protect,
    authController.restrictTo('pochecker'),
     paymentWorkflowController.poApprove
);

router.patch(
    "/po-send-back",
     authController.protect,
    authController.restrictTo('pochecker'),
     paymentWorkflowController.poSendBack
);

module.exports = router;