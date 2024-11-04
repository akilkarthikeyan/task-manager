var secrets = require('../config/secrets');
var User = require('../models/user');
var Task = require('../models/task');
var mongoose = require('mongoose');

class TaskNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskNotFoundError';
    }
}

class UserNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UserNotFoundError';
    }
}

module.exports = function (router) {

    var homeRoute = router.route('/');
    var usersRoute = router.route('/users');
    var usersIdRoute = router.route('/users/:id')
    var tasksRoute = router.route('/tasks');
    var tasksIdRoute = router.route('/tasks/:id')

    // home

    homeRoute.get(function (req, res) {
        var connectionString = secrets.token;
        return res.json({ message: 'My connection string is ' + connectionString });
    });

    // ------------------------------------------------------------------------------------

    // users

    usersRoute.get(async (req, res) => {
        try {
            const { where, sort, select, skip, limit, count } = req.query;
            let query = User.find();
            if (where) {
                query = query.find(JSON.parse(where));
            }
            if (sort) {
                query = query.sort(JSON.parse(sort));
            }
            if (select) {
                query = query.select(JSON.parse(select));
            }
            if (skip) {
                query = query.skip(parseInt(skip));
            }
            if (limit) {
                query = query.limit(parseInt(limit));
            }
            if (count) {
                const usersCount = await query.countDocuments();
                return res.status(200).json({
                    message: "Users count retrieved",
                    data: usersCount
                });
            }
            const users = await query.exec();
            return res.status(200).json({
                message: "Users retrieved",
                data: users
            });
        }
        catch (error) {
            return res.status(500).json({
                message: "An unexpected error occurred, try again",
                data: null
            })
        }
    });

    usersRoute.post(async (req, res) => {
        try {
            const user = new User(req.body);
            const newUser = await user.save()
            return res.status(201).json({
                message: "User created",
                data: newUser
            })
        }
        catch (error) {
            if(error.name === 'ValidationError') {
                return res.status(400).json({
                    message: error.message,
                    data: null
                })
            }
            else if(error.code === 11000) {
                return res.status(400).json({
                    message: "User validation failed: email: email has to be unique",
                    data: null
                })
            }
            else {
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null
                })
            }
        }
    });

    // ------------------------------------------------------------------------------------

    // users id

    usersIdRoute.get(async (req, res) => {
        try {
            const { select } = req.query;
            let query = User.findById(req.params.id);
            if(select) {
                query = query.select(JSON.parse(select));
            }
            const user = await query.exec();
            if (!user) {
                throw new UserNotFoundError(`User with ID ${req.params.id} not found`);
            }
            else {
                return res.json({
                    message: "User found",
                    data: user
                });
            }
        }
        catch(error) {
            if(error.kind === "ObjectId") {
                return res.status(400).json({ 
                    message: "Invalid user ID format",
                    data: null
                });
            }
            else if(error instanceof UserNotFoundError) {
                return res.status(404).json({
                    message: error.message,
                    data: null
                })
            }
            else {
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null
                })
            }
        }
    });

    usersIdRoute.put(async (req, res) => {
        const session = await mongoose.startSession();
        try {
            let user = null;
            await session.withTransaction(async () => {
                user = await User.findById(req.params.id).session(session);
                if(!user) {
                    throw new UserNotFoundError(
                        `User with ID ${req.params.id} not found`
                    );
                }
                if (req.body.name) user.name = req.body.name;
                if (req.body.email) user.email = req.body.email;
                if (req.body.pendingTasks) {
                    user.pendingTasks = Array.isArray(req.body.pendingTasks) ? req.body.pendingTasks : [req.body.pendingTasks];
                }
                await user.save({ session });
                for (let taskId of user.pendingTasks) {
                    const task = await Task.findById(taskId).session(session);
                    if (!task) {
                        throw new TaskNotFoundError(`Task with ID ${taskId} not found`);
                    }
                    task.assignedUser = req.params.id;
                    task.assignedUserName = user.name;
                    await task.save({ session });
                }
            });
            session.endSession();
            return res.json({
                message: "User updated successfully",
                data: user,
            });
        } 
        catch(error) {
            session.endSession();
            if (error.kind === "ObjectId") {
                return res.status(400).json({
                    message: "Invalid user ID format",
                    data: null,
                });
            } 
            else if(error instanceof UserNotFoundError || error instanceof TaskNotFoundError) {
                return res.status(404).json({
                    message: error.message,
                    data: null,
                });
            } 
            else {
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null,
                });
            }
        }
    });

    usersIdRoute.delete(async (req, res) => {
        const session = await mongoose.startSession();
        try {
            let user = null;
            await session.withTransaction(async () => {
                user = await User.findById(req.params.id).session(session);
                if (!user) {
                    throw new UserNotFoundError(`User with ID ${req.params.id} not found`);
                }
                let userTasks = [];
                if(user.pendingTasks) {
                    userTasks = user.pendingTasks;
                }
                await User.findByIdAndDelete(user._id).session(session);
                for (let taskId of userTasks) {
                    const task = await Task.findById(taskId).session(session);
                    if (task) {
                        task.assignedUser = "";
                        task.assignedUserName = "unassigned";
                        await task.save({ session });
                    }
                }
            });
            session.endSession();
            return res.json({
                message: "User deleted successfully",
                data: user
            });
    
        } catch (error) {
            session.endSession();
            if (error.kind === "ObjectId") {
                return res.status(400).json({ 
                    message: "Invalid user ID format",
                    data: null
                });
            } else if (error instanceof UserNotFoundError) {
                return res.status(404).json({
                    message: error.message,
                    data: null
                });
            } else {
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null
                });
            }
        }
    });

    // ------------------------------------------------------------------------------------
    
    // tasks

    tasksRoute.get(async (req, res) => {
        try {
            const { where, sort, select, skip, limit = 100, count } = req.query;
            let query = Task.find();
            if (where) {
                query = query.find(JSON.parse(where));
            }
            if (sort) {
                query = query.sort(JSON.parse(sort));
            }
            if (select) {
                query = query.select(JSON.parse(select));
            }
            if (skip) {
                query = query.skip(parseInt(skip));
            }
            if (limit) {
                query = query.limit(parseInt(limit));
            }
            if (count) {
                const tasksCount = await query.countDocuments();
                return res.status(200).json({
                    message: "Tasks count retrieved",
                    data: tasksCount
                });
            }
            const tasks = await query.exec();
            return res.status(200).json({
                message: "Tasks retrieved",
                data: tasks
            });
        }
        catch (error) {
            return res.status(500).json({
                message: "An unexpected error occurred, try again",
                data: null
            })
        }
    })

    tasksRoute.post(async (req, res) => {
        try {
            const task = new Task(req.body);
            const newTask = await task.save()
            return res.status(201).json({
                message: "Task created",
                data: newTask
            })
        }
        catch (error) {
            if(error.name === 'ValidationError') {
                return res.status(400).json({
                    message: error.message,
                    data: null
                })
            }
            else {
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null
                })
            }
        }
    });

    // ------------------------------------------------------------------------------------
    
    // tasks id

    tasksIdRoute.get(async (req, res) => {
        try {
            const { select } = req.query;
            let query = Task.findById(req.params.id);
            if(select) {
                query = query.select(JSON.parse(select));
            }
            const task = await query.exec();
            if (!task) {
                throw new TaskNotFoundError(`Task with ID ${req.params.id} not found`);
            }
            else {
                return res.json({
                    message: "Task found",
                    data: task
                });
            }
        }
        catch(error) {
            if(error.kind === "ObjectId") {
                return res.status(400).json({ 
                    message: "Invalid task ID format",
                    data: null
                });
            }
            else if(error instanceof TaskNotFoundError) {
                return res.status(404).json({
                    message: error.message,
                    data: null
                })
            }
            else {
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null
                })
            }
        }
    });

    tasksIdRoute.put(async (req, res) => {
        const session = await mongoose.startSession();
        try {
            let task = null;
            await session.withTransaction(async () => {
                task = await Task.findById(req.params.id).session(session);
                if (!task) {
                    throw new TaskNotFoundError(`Task with ID ${req.params.id} not found`);
                }
                const previousAssignedUser = task.assignedUser;
                if (req.body.name) task.name = req.body.name;
                if (req.body.description) task.description = req.body.description;
                if (req.body.deadline) task.deadline = new Date(req.body.deadline);
                if (req.body.hasOwnProperty('completed')) task.completed = req.body.completed;
                if (req.body.hasOwnProperty('assignedUser')) {
                    // If assigning to a user (not unassigning)
                    if (req.body.assignedUser) {
                        const newUser = await User.findById(req.body.assignedUser).session(session);
                        if (!newUser) {
                            throw new UserNotFoundError(`User with ID ${req.body.assignedUser} not found`);
                        }
                        task.assignedUser = newUser._id;
                        task.assignedUserName = newUser.name;
                        if (!newUser.pendingTasks.includes(task._id)) {
                            newUser.pendingTasks.push(task._id);
                            await newUser.save({ session });
                            updatedUser = newUser;
                        }
                    } else {
                        // Unassigning task
                        task.assignedUser = "";
                        task.assignedUserName = "unassigned";
                    }
                }
                await task.save({ session });
                // If task was previously assigned to a different user, remove it from their pendingTasks
                if (previousAssignedUser && 
                    previousAssignedUser !== task.assignedUser && 
                    previousAssignedUser !== "") {
                    const prevUser = await User.findById(previousAssignedUser).session(session);
                    if (prevUser) {
                        prevUser.pendingTasks = prevUser.pendingTasks.filter(
                            taskId => taskId.toString() !== task._id.toString()
                        );
                        await prevUser.save({ session });
                    }
                }
            });
            session.endSession();
            return res.json({
                message: "Task updated successfully",
                data: task
            });
    
        } 
        catch (error) {
            session.endSession();
            if (error.kind === "ObjectId") {
                return res.status(400).json({
                    message: "Invalid task ID format",
                    data: null
                });
            } 
            else if (error instanceof TaskNotFoundError || error instanceof UserNotFoundError) {
                return res.status(404).json({
                    message: error.message,
                    data: null
                });
            }
            else {
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null
                });
            }
        }
    });

    tasksIdRoute.delete(async (req, res) => {
        const session = await mongoose.startSession();
        try {
            let task = null;
            await session.withTransaction(async () => {
                task = await Task.findById(req.params.id).session(session);
                if (!task) {
                    throw new TaskNotFoundError(`Task with ID ${req.params.id} not found`);
                }
                const userId = task.assignedUser;
                await Task.findByIdAndDelete(task._id).session(session);
                if(userId) {
                    const user = await User.findById(userId).session(session);
                    if(user) {
                        user.pendingTasks = user.pendingTasks.filter(
                            taskId => taskId.toString() !== task._id.toString()
                        );
                        await user.save({ session });
                    }
                }
            });
            session.endSession();
            return res.json({
                message: "Task deleted successfully",
                data: task
            });
    
        } 
        catch (error) {
            session.endSession();
            if (error.kind === "ObjectId") {
                return res.status(400).json({ 
                    message: "Invalid task ID format",
                    data: null
                });
            } else if (error instanceof TaskNotFoundError) {
                return res.status(404).json({
                    message: error.message,
                    data: null
                });
            } else {
                console.error('Unexpected error:', error);
                return res.status(500).json({
                    message: "An unexpected error occurred, try again",
                    data: null
                });
            }
        }
    });

    return router;
}
