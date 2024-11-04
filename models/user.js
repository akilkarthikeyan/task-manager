var mongoose = require('mongoose');

var UserSchema = new mongoose.Schema({
    name: { type: String, required: [true, "name is required"]},
    email: { type: String, required: [true, "email is required"], unique: [true, "email has to be unique"]},
    pendingTasks: { type: [String], default: [] },
    dateCreated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
