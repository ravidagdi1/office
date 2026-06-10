const Fabrication = require('../models/FabricationModel');
const Inventory = require('../models/inventoryModel')

// Get fabrications by storeId
exports.getFabrications = async (req, res) => {
  try {
    const { storeId } = req.query;
    const { status } = req.query;

    if (!storeId) {
      return res.status(400).json({ message: 'Store ID is required' });
    }

    // Build the query
    const query = { storeId };
    if (status) {
      query.status = status;
    }

    const fabrications = await Fabrication.find(query)
    .populate({
      path: 'sentItems.inventoryId',
      model: 'Inventory', // Name of the model being referenced
    })
    .populate({
      path: 'receivedItem.inventoryId',
      model: 'Inventory', // Name of the model being referenced
    })
    .populate({
      path: 'storeId',
      model: 'Store', // Populate the store if needed
    });

    res.status(200).json({ message: 'Fabrications retrieved successfully', fabrications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update fabrication
exports.updateFabrication = async (req, res) => {
  try {
    const { fabricationId } = req.params;
    const updateData = req.body;

    const fabrication = await Fabrication.findByIdAndUpdate(fabricationId, updateData, { new: true });

    if (!fabrication) {
      return res.status(404).json({ message: 'Fabrication not found' });
    }

    res.status(200).json({ message: 'Fabrication updated successfully', fabrication });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete fabrication
exports.deleteFabrication = async (req, res) => {
  try {
    const { fabricationId } = req.params;

    const fabrication = await Fabrication.findByIdAndDelete(fabricationId);

    if (!fabrication) {
      return res.status(404).json({ message: 'Fabrication not found' });
    }

    res.status(200).json({ message: 'Fabrication deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};



exports.initiateTrade = async (req, res) => {
  try {
    const { storeId, sentItems } = req.body;

    if (!storeId || !Array.isArray(sentItems) || sentItems.length === 0) {
      return res.status(400).json({ message: 'Invalid input' });
    }

    console.log(sentItems)

    // Check if sufficient inventory exists for sent items
    for (const item of sentItems) {
      const inventoryItem = await Inventory.findById(item.inventoryId);
      
      console.log("inventory",inventoryItem)

      console.log(!inventoryItem , inventoryItem.store._id, storeId)
      if (!inventoryItem || inventoryItem.store._id.toString() !== storeId || inventoryItem.currentStock < Number(item.quantity)) {
        return res.status(400).json({ message: `Insufficient stock for item with ID ${item.inventoryId}` });
      }

      // Reserve the stock temporarily
      inventoryItem.currentStock -= Number(item.quantity);
      inventoryItem.totalMiv +=Number(item.quantity);
      await inventoryItem.save();
    }

    const lastFabrication = await Fabrication
          .findOne()
          .sort({ fabricationNo: -1 });
        const fabricationNo = lastFabrication ? lastFabrication.fabricationNo + 1 : 1;
    // Create a transaction record
    const fabrication = new Fabrication({
      fabricationNo,
      storeId,
      sentItems,
    });

    await fabrication.save();

    res.status(200).json({ message: 'Trade initiated successfully', fabrication });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Step 2: Complete trade
exports.completeTrade = async (req, res) => {
  try {
    const { fabricationId, receivedItem } = req.body;

    if (!fabricationId || !Array.isArray(receivedItem) || receivedItem.length === 0) {
      return res.status(400).json({ message: 'Invalid input' });
    }

    const fabrication = await Fabrication.findById(fabricationId);

    if (!fabrication || fabrication.status !== 'initiated') {
      return res.status(404).json({ message: 'Fabrication not found or already completed' });
    }

    // Process each received item
    for (const item of receivedItem) {
      const { inventoryId, quantity } = item;

      console.log(item)
      // Validate item properties
      if (!inventoryId ||  quantity <= 0) {
        return res.status(400).json({ message: 'Invalid item in receivedItem array' });
      }

      // Find and update inventory
      let inventoryItem = await Inventory.findOne({
        store: fabrication.storeId,
        _id: inventoryId,
      });

      if (inventoryItem) {
        inventoryItem.currentStock += quantity;
        inventoryItem.totalRecive += quantity;
        await inventoryItem.save();
      } else {
        return res.status(404).json({ message: `Inventory item not found for ID: ${inventoryId}` });
      }
    }

    // Update the fabrication transaction
    fabrication.receivedItem = receivedItem; // Save the entire array
    fabrication.status = 'completed';
    await fabrication.save();

    res.status(200).json({ message: 'Trade completed successfully', fabrication });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.fabricationReport = async (req, res) => {
  try {
    const { fromDate, toDate, status } = req.body;

    const from = fromDate ? new Date(fromDate) : new Date("2025-01-01T00:00:00.000Z");
    const to = toDate ? new Date(toDate) : new Date();

    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    let matchQuery = {
      fabricationDate: { $gte: from, $lte: to },
    };

    if (status && status !== "all") {
      matchQuery.status = status;
    }

    // Debugging: Log the query and timestamps
    console.log("From Date:", from.toISOString());
    console.log("To Date:", to.toISOString());
    console.log("Final Query:", JSON.stringify(matchQuery, null, 2));

    // Fetch data
    const data = await Fabrication.find(matchQuery)
      .populate("sentItems.inventoryId", "partNo description unitName")
      .populate("receivedItem.inventoryId", "partNo description unitName");

    console.log("Data found:", data.length);

    return res.status(200).json({ status: "success", data, count: data.length });

  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
};




