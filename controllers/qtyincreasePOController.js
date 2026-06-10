const mongoose = require("mongoose");
const QtyIncreaseRequest = require("../models/qtyIncreaseRequestModel");
const Requisition = require("../models/requestedModel");
const Item = require("../models/itemModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// ✅ CREATE QTY INCREASE REQUEST
exports.createQtyIncreaseRequest = catchAsync(
    async (req, res, next) => {

        // ✅ CHECK PAYLOAD
        if (!Array.isArray(req.body)) {

            return next(
                new AppError(
                    "Invalid request format",
                    400
                )
            );

        }

        if (req.body.length === 0) {

            return next(
                new AppError(
                    "Please select at least one item",
                    400
                )
            );

        }

        // ✅ PREPARE DATA
        const formattedData = [];

        // ✅ SINGLE REQUISITION ID
        const requisitionId =
            req.body[0]?.requisitionId;

        // ✅ VALIDATE REQUISITION ID
        if (
            !mongoose.Types.ObjectId.isValid(
                requisitionId
            )
        ) {

            return next(
                new AppError(
                    "Invalid requisition selected",
                    400
                )
            );

        }

        // ✅ CHECK REQUISITION EXIST
        const requisitionExist =
            await Requisition.findById(
                requisitionId
            ).select("_id status");

        if (!requisitionExist) {

            return next(
                new AppError(
                    "Requisition not found",
                    404
                )
            );

        }

        // ✅ VALIDATE ITEMS
        for (const item of req.body) {

            const {
                itemId,
                currentApprovedQty,
                newRequiredQty,
                remarks,
            } = item;

            // ✅ ITEM VALIDATION
            if (!itemId) {

                return next(
                    new AppError(
                        "Item not found",
                        400
                    )
                );

            }

            // ✅ OBJECT ID VALIDATION
            if (
                !mongoose.Types.ObjectId.isValid(
                    itemId
                )
            ) {

                return next(
                    new AppError(
                        "Invalid item selected",
                        400
                    )
                );

            }

            // ✅ NEW QTY VALIDATION
            if (
                !newRequiredQty ||
                Number(newRequiredQty) <= 0
            ) {

                return next(
                    new AppError(
                        "Please enter valid new qty",
                        400
                    )
                );

            }

            // ✅ NEW QTY SHOULD BE GREATER
            if (
                Number(newRequiredQty) <=
                Number(currentApprovedQty)
            ) {

                return next(
                    new AppError(
                        "New qty should be greater than approved qty",
                        400
                    )
                );

            }

            // ✅ REMARKS VALIDATION
            if (
                !remarks ||
                remarks.trim() === ""
            ) {

                return next(
                    new AppError(
                        "Remarks are required",
                        400
                    )
                );

            }

            // ✅ CHECK ITEM EXIST
            const itemExist =
                await Item.findById(
                    itemId
                ).select("_id");

            if (!itemExist) {

                return next(
                    new AppError(
                        "Selected item not found",
                        404
                    )
                );

            }

            // ✅ PREVENT DUPLICATE PENDING REQUEST
            const alreadyPending =
                await QtyIncreaseRequest.exists({
                    itemId,
                    requisitionId,
                    status: "Pending",
                });

            if (alreadyPending) {

                return next(
                    new AppError(
                        "Qty increase request already pending for selected item",
                        400
                    )
                );

            }

            // ✅ PUSH DATA
            formattedData.push({

                itemId,

                requisitionId,

                currentApprovedQty:
                    Number(currentApprovedQty || 0),

                newRequiredQty:
                    Number(newRequiredQty),

                remarks:
                    remarks?.trim(),

                createdBy:
                    req.user?._id || null,

            });

        }

        // ✅ BULK INSERT
        const createdRequests =
            await QtyIncreaseRequest.insertMany(
                formattedData,
                {
                    ordered: false,
                }
            );

        // ✅ UPDATE ONLY SELECTED ITEMS
        const selectedItemIds =
            formattedData.map(
                (item) => item.itemId
            );

        await Item.updateMany(
            {
                _id: {
                    $in: selectedItemIds,
                },
            },
            {
                $set: {
                    status: "AssignedToHo",
                },
            }
        );

        // ✅ RESPONSE
        return res.status(201).json({

            success: true,

            message:
                "Qty increase request sent to HO successfully",

            totalRequests:
                createdRequests.length,

            data: createdRequests,

        });

    }
);


// ✅ GET QTY INCREASE REQUESTS BY STATUS
exports.getQtyIncreaseRequests =
    catchAsync(async (req, res, next) => {

        // ✅ GET STATUS FROM QUERY
        const status =
            req.query.status?.trim();

        // ✅ STATUS VALIDATION
        if (!status) {

            return next(
                new AppError(
                    "Please provide status",
                    400
                )
            );

        }

        // ✅ ALLOWED STATUS
        const allowedStatus = [
            "Pending",
            "Approved",
            "Rejected",
        ];

        // ✅ INVALID STATUS
        if (
            !allowedStatus.includes(status)
        ) {

            return next(
                new AppError(
                    "Invalid status value",
                    400
                )
            );

        }

        // ✅ GET DATA
        const requests =
            await QtyIncreaseRequest.find({
                status,
            })

                .populate({
                    path: "itemId",
                    select:
                        "qtyRequired status poStatus inventory",
                    populate: {
                        path: "inventory",
                        select:
                            "masterItem",
                        populate: {
                            path: "masterItem",
                            select:
                                "partNo description unit",
                            populate: {
                                path: "unit",
                                select: "name",
                            },
                        },
                    },
                })

                .populate({
                    path: "requisitionId",
                    select:
                        "requisitionNo status createdAt",
                })

                .populate({
                    path: "createdBy",
                    select:
                        "name email role",
                })

                .populate({
                    path: "approvedBy",
                    select:
                        "name email role",
                })

                .sort({
                    createdAt: -1,
                })

                .lean();

        // ✅ NO DATA FOUND
        if (!requests.length) {

            return res.status(200).json({

                success: true,

                message:
                    `No ${status} requests found`,

                results: 0,

                data: [],

            });

        }

        // ✅ RESPONSE
        return res.status(200).json({

            success: true,

            message:
                `${status} qty increase requests fetched successfully`,

            results:
                requests.length,

            data: requests,

        });

    });


exports.processQtyIncreaseRequest = catchAsync(
  async (req, res, next) => {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const {
        requestId,
        requestIds,
        action,
        remarks,
        approvedQtyMap,
      } = req.body;

      const ids = requestIds?.length
        ? requestIds
        : requestId
        ? [requestId]
        : [];

      if (!ids.length) {
        await session.abortTransaction();

        return next(
          new AppError(
            "Please select request(s)",
            400
          )
        );
      }

      const requests =
        await QtyIncreaseRequest.find({
          _id: { $in: ids },
          status: "Pending",
        }).session(session);

      if (!requests.length) {
        await session.abortTransaction();

        return next(
          new AppError(
            "No pending requests found",
            404
          )
        );
      }

      for (const request of requests) {
        const item = await Item.findById(
          request.itemId
        ).session(session);

        if (!item) continue;

        // ======================
        // APPROVE
        // ======================
        if (action === "approve") {
          const finalQty =
            approvedQtyMap?.[
              request._id.toString()
            ] ?? request.newRequiredQty;

          request.status = "Approved";
          request.approvedBy =
            req.user._id;
          request.approvedByDirectorQty =
            finalQty;
          request.remarks =
            remarks || "";

          await request.save({
            session,
          });

          item.status = "approved";
          item.approveQty =
            finalQty;

          await item.save({
            session,
          });
        }

        // ======================
        // REJECT
        // ======================
        else if (
          action === "reject"
        ) {
          request.status = "Rejected";
          request.approvedBy =
            req.user._id;
          request.remarks =
            remarks || "";

          await request.save({
            session,
          });

          // qty remains unchanged
          item.status = "approved";

          await item.save({
            session,
          });
        }
      }

      await session.commitTransaction();

      res.status(200).json({
        status: "success",
        results: requests.length,
        message: `${requests.length} request(s) processed successfully`,
      });
    } catch (error) {
      await session.abortTransaction();
      return next(error);
    } finally {
      session.endSession();
    }
  }
);