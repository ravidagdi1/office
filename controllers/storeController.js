
const Store = require('../models/storeModel');
const factory = require('./handlerFactory');


exports.createStore = factory.createOne(Store)

exports.getStoreById = factory.getOne(Store);
exports.getAllStore = factory.getAll(Store);

exports.updateStoreById = factory.updateOne(Store);
exports.deleteStoreById = factory.deleteOne(Store);
