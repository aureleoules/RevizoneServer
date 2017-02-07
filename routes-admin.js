module.exports = (function() {
    'use strict';
    var app = require('express').Router();
    var mongo = require('mongodb');
    var MongoClient = require('mongodb').MongoClient;
    var config = require('./config/database'); // get db config file
    var jwt = require('jwt-simple');
    var User = require('./app/models/user'); // get the mongoose model
    const nodemailer = require('nodemailer');


    app.post('/createTodo', function(req, res) {
        var token = getToken(req.headers);
        var task = req.body.task;
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else if (!task.titre || !task.description) {
            res.json({
                success: false,
                msg: 'Veuillez définir votre tâche.'
            })
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var collection = db.collection('todolist');
                collection.insertOne({
                    titre: task.titre,
                    description: task.description,
                    difficultee: task.difficultee,
                    duree: task.duree,
                    commentaire: task.commentaire,
                    completed: false,
                    createdAt: new Date().toISOString(),
                    auteur: decoded.pseudo
                }).then(function(data) {
                    res.json({
                        success: true,
                        msg: 'Tâche enregistrée avec succès!'
                    });
                });
            });
        }
    });

    app.get('/getTodo', function(req, res) {
        var token = getToken(req.headers);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var collection = db.collection('todolist');
                var isCompleted = (req.query.completed == 'true');
                collection.find({
                    completed: isCompleted
                }).toArray().then(function(data) {
                    console.log(isCompleted);
                    console.log(data);
                    res.json(data);
                });
            });
        }
    });

    app.delete('/removeTodo', function(req, res) {
        var token = getToken(req.headers);
        var todoId = new mongo.ObjectID(req.query.todoId);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else if (!req.query.todoId) {
            res.json({
                success: false,
                msg: 'Aucune tâche a supprimer.'
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var collection = db.collection('todolist');
                collection.remove({
                    _id: todoId
                }).then(function(result) {
                    res.json({
                        success: true,
                        msg: 'Tâche supprimée avec succès.'
                    });
                });
            });
        }
    });

    app.post('/changeTodoState', function(req, res) {
        var token = getToken(req.headers);
        var todoId = new mongo.ObjectID(req.body.todoId);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else if (!req.body.todoId) {
            res.json({
                success: false,
                msg: 'Aucune tâche a terminer.'
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var collection = db.collection('todolist');
                var isCompleted = (req.body.completed === 'true');
                collection.update({
                    _id: todoId
                }, {
                    $set: {
                        completed: isCompleted
                    }
                }).then(function(result) {
                    res.json({
                        success: true,
                        msg: 'Tâche terminée avec succès.'
                    });
                });
            });
        }
    });
    app.get('/getUserInfos', function(req, res) {
        var token = getToken(req.headers);
        var userPseudo = req.query.pseudo;
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var collection = db.collection('users');
                collection.find({
                    pseudo: userPseudo
                }, {
                    password: 0
                }).toArray().then(function(data) {
                    res.json(data[0]);
                });
            });
        }
    });

    app.post('/saveUserInfos', function(req, res) {
        var token = getToken(req.headers);
        var user = req.body.user;
        var user_id = new mongo.ObjectID(user._id);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var collection = db.collection('users');
                collection.update({
                    _id: user_id
                }, {
                    $set: {
                        name: user.name,
                        pseudo: user.pseudo,
                        email: user.email,
                        scolaire: {
                            code_postal: user.scolaire.code_postal,
                            etablissement: user.scolaire.etablissement,
                            classe: user.scolaire.classe,
                            numero_classe: user.scolaire.classe
                        },
                        role: user.role
                    }
                }).then(function(data) {
                    res.json({
                        success: true,
                        msg: 'Utilisateur modifié avec succès!'
                    });
                });
            });
        }
    });

    app.get('/listUsers', function(req, res) {
        var pageSize = 20;
        var token = getToken(req.headers);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var statistics = {};
                var collection = db.collection('users');
                collection.find({}, {
                    name: 1,
                    pseudo: 1,
                    email: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    role: 1
                }).skip(pageSize * (req.query.page - 1)).limit(pageSize).toArray().then(function(data) {
                    res.json(data);
                });
            });
        }
    });

    app.get('/listCours', function(req, res) {
        var pageSize = 20;
        var token = getToken(req.headers);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var statistics = {};
                var collection = db.collection('cours');
                collection.find({}, {
                    auteur: 1,
                    classe: 1,
                    matiere: 1,
                    chapitre: 1,
                    titre: 1,
                    lectures: 1,
                    createdAt: 1,
                    modifiedAt: 1,
                    public: 1
                }).skip(pageSize * (req.query.page - 1)).limit(pageSize).toArray().then(function(data) {
                    res.json(data);
                });
            });
        }
    });

    app.get('/statistics', function(req, res) {
        var token = getToken(req.headers);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else {
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var statistics = {};
                var collection = db.collection('users');
                collection.stats().then(function(data) {
                    statistics.users = {
                        length: data.count,
                        size: data.size,
                    }
                    collection = db.collection('cours');
                    collection.stats().then(function(data) {
                        statistics.cours = {
                            length: data.count,
                            size: data.size,
                        }
                        res.json(statistics);
                    });
                });

            });
        }
    });

    app.post('/authenticate', function(req, res) {
        User.findOne({
            pseudo: req.body.pseudo.toLowerCase(),
            role: 'admin'
        }, function(err, user) {
            if (err) throw err;

            if (!user) {
                res.send({
                    success: false,
                    msg: 'Connexion échouée. Utilisateur non trouvé.'
                });
            } else {
                // check if password matches
                user.comparePassword(req.body.password, function(err, isMatch) {
                    if (isMatch && !err) {
                        // if user is found and password is right create a token
                        var token = jwt.encode({
                            pseudo: user.pseudo,
                            name: user.name,
                            createdAt: user.createdAt,
                            role: user.role
                        }, config.secret);
                        // return the information including token as JSON
                        res.json({
                            success: true,
                            token: 'JWT ' + token
                        });
                    } else {
                        res.send({
                            success: false,
                            msg: 'Connexion échouée. Mauvais mot de passe.'
                        });
                    }
                });
            }
        });
    });

    app.post('/sendEmail', function(req, res) {
        var token = getToken(req.headers);
        var decoded;
        if (token) {
            var decoded = jwt.decode(token, config.secret);
        }
        if (!decoded || decoded.role !== 'admin') {
            res.json({
                success: false,
                msg: "Vous n'êtes pas connecté!"
            });
        } else {
            let smtpConfig = {
                host: 'mail.revizone.fr',
                port: 587,
                auth: {
                    user: config.smtpuser,
                    pass: config.smtppass
                },
                tls: {
                    rejectUnauthorized: false
                }
            };
            var message = {
                from: 'no-reply@revizone.fr',
                to: req.body.dest,
                subject: req.body.subject,
                html: req.body.body,
                cc: req.body.cc,
                bcc: req.body.bcc
            };
            let transporter = nodemailer.createTransport(smtpConfig);
            transporter.sendMail(message, function(err, result) {
            });
            res.json({
                success: true,
                msg: 'Email envoyé.',
                email: message
            });
        }
    });

    app.get('/status', function(req, res) {
        res.json({
            success: true,
            msg: 'Le serveur est allumé.'
        });
    });

    return app;
})();
