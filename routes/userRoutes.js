const express = require('express');
const userController = require('./../controllers/userController');
const authController = require('./../controllers/authController');

const router = express.Router();

router.get('/me',authController.protect,userController.getMe, userController.getUser);
router
  .route('/')
  .get(userController.getAllUsers)
  .post(userController.createUser);

router
  .route('/:id')
  .get(userController.getUser)
  .put(userController.updateUser)
  .delete(userController.deleteUser);

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);


router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

// Protect all routes after this middleware
router.use(authController.protect);

router.patch('/updateMyPassword', authController.updatePassword);

router.get('/store/:storeId' , userController.getDriversByStore);

// Send OTP (WhatsApp / Email)
router.post("/send-otp", authController.sendPasswordOtp);

// Verify OTP & Reset Password
router.post("/verify-otp-password", authController.resetPasswordByOtp);

router.patch(
  '/updateMe',
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe
);
router.delete('/deleteMe', userController.deleteMe);

router.post("/users-by-stores", userController.getUsersByStores);

//router.use(authController.restrictTo('admin'));




module.exports = router;
