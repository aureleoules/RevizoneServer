module.exports = (function() {
    'use strict';
    var app = require('express').Router();
    var mongo = require('mongodb');
    var MongoClient = require('mongodb').MongoClient;
    var config = require('./config/database'); // get db config file
    var jwt = require('jwt-simple');
    var User = require('./app/models/user'); // get the mongoose model
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
        console.log(decoded);
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

    app.get('/status', function(req, res) {
        res.json({
            success: true,
            msg: 'Le serveur est allumé.'
        });
    });

    return app;
})();
