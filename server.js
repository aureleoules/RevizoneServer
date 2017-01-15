var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var morgan = require('morgan');
var mongoose = require('mongoose');
var mongo = require('mongodb');
var MongoClient = require('mongodb').MongoClient;
var passport = require('passport');
var config = require('./config/database'); // get db config file
var User = require('./app/models/user'); // get the mongoose model
const util = require('./Utils/removeDiacritics');
var bcrypt = require('bcrypt');
var fs = require("fs");
var request = require("request");

String.prototype.capitalizeFirstLetter = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
};
var port = process.env.PORT || 8089;
var jwt = require('jwt-simple');

// get our request parameters
app.use(bodyParser.urlencoded({
    extended: false,
    limit: '50mb'
}));
app.use(bodyParser.json({
    limit: '50mb'
}));
// log to console
app.use(morgan('dev'));

// Use the passport package in our application
app.use(passport.initialize());
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.end();
    } else {
        next();
    }
});
// demo Route (GET http://localhost:8088)
app.get('/', function(req, res) {
    res.json({
        state: '200',
        msg: "Bienvenue sur le serveur nodeJS de ReviZone"
    });
});
var database = mongoose.connect(config.database);

// pass passport for configuration
require('./config/passport')(passport);

// bundle our routes
var apiRoutes = express.Router();

apiRoutes.get('/getProfile', function(req, res)  {
    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('users');
        collection.find({
            pseudo: req.query.pseudo.toLowerCase()
        },   {
            password: 0
        }).toArray(function(err, user) {
            res.json(user);
        });
    });
});

apiRoutes.post('/savePicture', function(req, res)  {
    var imgData = req.body.img;
    var pseudo = req.body.pseudo;
    if (!imgData || !pseudo)  {
        res.json({
            success: false,
            msg: 'Image non sauvegardée.'
        })
    } else {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('users');
            if (imgData.length < 1000)  {
                collection.update({
                    "pseudo": pseudo
                }, {
                    '$set': {
                        "picture": 'http://i.imgur.com/Dknt6vC.png'
                    }
                });
            } else {
                collection.update({
                    "pseudo": pseudo
                }, {
                    '$set': {
                        "picture": imgData
                    }
                });
            }
            res.json({
                success: true,
                msg: 'Image sauvegardée.'
            })
        });
    }
});

apiRoutes.get('/getPicture', function(req, res)  {
    var pseudo = req.query.pseudo;
    if (!pseudo)  {
        res.json({
            success: false,
            msg: 'Pas de pseudonyme fourni.'
        });
    } else {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('users');
            collection.find({
                "pseudo": pseudo
            },   {
                _id: 0,
                picture: 1
            }).toArray(function(err, picture) {
                res.json(picture);
            });
        });
    }
});
apiRoutes.get('/getUserFeed', function(req, res)  {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    var feed = [];
    if (!pseudo)  {
        res.json({
            success: false,
            msg: 'Utilisateur non connecté'
        });
    } else {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('users');
            collection.find({
                pseudo: pseudo
            },   {
                _id: 0,
                followed: 1
            }).toArray(function(err, data) {
                var followedList = data[0].followed;
                if (followedList !== undefined)  {
                    followedList.push(pseudo);
                    var query = {};
                    query['auteur'] = {
                        "$in": followedList
                    };
                    MongoClient.connect(config.database, function(err, db) {
                        if (err) {
                            return console.dir(err);
                        }
                        var collection = db.collection('cours');
                        collection.find(query,   {
                            _id: 1,
                            classe: 1,
                            chapitre: 1,
                            matiere: 1,
                            titre: 1,
                            lectures: 1,
                            auteur: 1,
                            createdAt: 1
                        }).limit(50).toArray(function(err, data) {
                            feed = data;
                            res.json({
                                success: true,
                                feed: feed
                            })
                        });
                    });
                }

            });
        });
    }
});
apiRoutes.get('/getEtablissementById', function(req, res)  {
    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('etablissements');
        collection.find({
            numero_uai: req.query.id
        }).toArray(function(err, etab) {
            res.json(etab);
        });
    });
});


apiRoutes.get('/chercherCours', function(req, res)  {
    var criteres = { //Data passed by user
        classe: req.query.classe,
        matiere: req.query.matiere,
        chapitre: req.query.chapitre,
        tags: req.query.keywords,
    }
    const pageSize = 10;
    Object.keys(criteres).map(function(item, index) { //remove keys where value === "Tous"
        if (criteres[item] === "Tous" || criteres[item] === "") {
            delete criteres[item];
        }
    });
    if (!req.query.keywords && !criteres.hasOwnProperty('classe')) {
        res.json({
            success: false,
            msg: 'Remplissez au moins un champ.'
        });
    } else {
        var searchQuery
        if (criteres.hasOwnProperty("tags"))  {
            var arrTags = criteres.tags.split(',');
            var queryArr = [];
            for (var i = 0; i < arrTags.length; i++)  {
                queryArr.push(`'${arrTags[i]}'`);
            }
            searchQuery = queryArr.join(' ');
        }


        var keysCriteres = Object.keys(criteres);
        var query =   {};
        for (var i = 0; i < keysCriteres.length; i++)  {
            if (keysCriteres[i] !== "tags")  {
                query[keysCriteres[i]] = criteres[keysCriteres[i]];
            }
        }
        if (searchQuery)  {
            query['$text'] = {
                $search: searchQuery
            }
        }
        var coursLength;
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('cours');
            collection.find(query).count(function(err, coursList) {
                coursLength = coursList;
                MongoClient.connect(config.database, function(err, db) {
                    if (err) {
                        return console.dir(err);
                    }
                    var collection = db.collection('cours');
                    collection.find(query, {
                        content: 0
                    }).skip(pageSize * (req.query.page - 1)).limit(pageSize).toArray(function(err, cours) {
                        res.json({
                            cours: cours,
                            coursLength: coursLength
                        });
                    });
                });
            });
        });

    }
});
apiRoutes.get('/getListCours', function(req, res)  {
    var pseudo = req.query.pseudo.toLowerCase();
    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('cours');
        collection.find({
            auteur: pseudo
        }, {
            content: 0
        }).toArray(function(err, cours) {
            res.json(cours);
        });
    });
});

apiRoutes.get('/getCoursRate', function(req, res)  {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var coursId = new mongo.ObjectID(req.query.coursId);
    var pseudo = decoded.pseudo.toLowerCase();
    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('cours');
        var key = "rates." + pseudo + ".rate";
        var query = {};
        query[key] = 1;
        collection.find({
            _id: coursId
        }, {
            _id: 0,
            rates: {
                $elemMatch: {
                    pseudo: pseudo
                }
            }
        }).toArray().then(function(rate)  {
            try  {
                var returnedRate = rate[0].rates[0].rate;
                if (returnedRate)  {
                    res.json({
                        rate: rate[0].rates[0].rate
                    })
                } else {
                    res.json({
                        success: false,
                        msg: 'Aucune note attribuée pour ce cours.'
                    });
                }
            } catch (e) {
                res.json({
                    success: false,
                    msg: 'Aucune note attribuée pour ce cours.'
                });
            }
        });
    });
});
apiRoutes.get('/getClasse', function(req, res)  {
    var token = getToken(req.headers);
    var user;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo.toLowerCase();
    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('users');
        collection.find({
            pseudo: pseudo
        }, {
            "scolaire.etablissement": 1,
            "scolaire.classe": 1,
            "scolaire.numero_classe": 1
        }).toArray(function(err, result) {
            var user = result[0];
            MongoClient.connect(config.database, function(err, db) {
                if (err) {
                    return console.dir(err);
                }
                var collection = db.collection('users');
                collection.find({
                    "scolaire.etablissement": user.scolaire.etablissement,
                    "scolaire.classe": user.scolaire.classe,
                    "scolaire.numero_classe": user.scolaire.numero_classe
                },   {
                    "_id": 1,
                    "pseudo": 1,
                    "name": 1,
                    "scolaire.etablissement": 1,
                    "scolaire.classe": 1,
                    "scolaire.numero_classe": 1
                }).toArray(function(err, classe) {
                    res.json(classe);
                });
            });
        });
    });

});

apiRoutes.get('/getCours', function(req, res)  {
    var coursId = new mongo.ObjectID(req.query.coursId);

    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('cours');
        collection.find({
            _id: coursId
        }).toArray(function(err, cours) {
            if (cours.length < 1)  {
                res.json({
                    success: false,
                    msg: "Ce cours est introuvable."
                });

            } else {
                res.json(cours);
                var collection = db.collection('cours');
                collection.update({
                    _id: coursId
                },   {
                    $inc:  {
                        lectures: 1
                    }
                });
            }
        });
    });
});
apiRoutes.get('/getetablissements', function(req, res)  {
    var codepostal = req.query.code_postal;
    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('etablissements');
        collection.find({
            code_postal_uai: parseInt(codepostal),
            nature_uai: {
                $gt: 300
            }
        }, {
            appellation_officielle: 1,
            numero_uai: 1,
            _id: 0
        }).toArray(function(err, etablissements) {
            res.json(etablissements);
        });
    });
});

apiRoutes.get('/getprogramme', function(req, res) {
    MongoClient.connect(config.database, function(err, db) {
        if (err) {
            return console.dir(err);
        }
        var collection = db.collection('education');
        collection.find().toArray(function(err, user) {
            res.json(user);
        });
    });
});

apiRoutes.put('/editCours', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo.toLowerCase();
    var coursId = new mongo.ObjectID(req.body.coursId);
    if (!pseudo || !coursId) {
        res.json({
            success: false,
            msg: "Erreur lors de la modification du cours."
        });
    } else {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('cours');

            collection.update({
                _id: coursId,
                auteur: pseudo
            }, {
                $set: {
                    content: req.body.content,
                    modifiedAt: new Date().toISOString()
                }
            });
            res.json({
                success: true,
                msg: "Cours enregistré avec succès."
            });
        });
    }
});

apiRoutes.put('/editPassword', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    if (!pseudo || !req.body.passwords.old || !req.body.passwords.new || !req.body.passwords.confirm  || (req.body.passwords.new !== req.body.passwords.confirm)) {
        res.json({
            success: false,
            msg: "Echec lors de la modification du mot de passe."
        });
    } else {
        User.findOne({
            pseudo: pseudo
        }, function(err, user) {
            if (err) throw err;
            if (!user) {
                res.send({
                    success: false,
                    msg: 'Connexion échouée. Utilisateur non trouvé.'
                });
            } else {
                // check if password matches
                user.comparePassword(req.body.passwords.old, function(err, isMatch) {
                    if (isMatch && !err) {
                        var User = {
                            password: req.body.passwords.new
                        };
                        bcrypt.genSalt(10, function(err, salt) {
                            if (err) {
                                return err;
                            }
                            bcrypt.hash(User.password, salt, function(err, hash) {
                                if (err) {
                                    return err;
                                }
                                MongoClient.connect(config.database, function(err, db) {
                                    if (err) {
                                        return console.dir(err);
                                    }
                                    var collection = db.collection('users');
                                    collection.updateOne({
                                        pseudo: pseudo
                                    }, {
                                        $set: {
                                            "password": hash,
                                        }
                                    });
                                    res.json({
                                        success: true,
                                        msg: "Mot de passe enregistré avec succès."
                                    });
                                });
                            });
                        });
                    } else {
                        res.send({
                            success: false,
                            msg: 'Echec. Mauvais mot de passe.'
                        });
                    }
                });
            }
        });
    }

});

apiRoutes.put('/editUser', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    if (!pseudo) {
        res.json({
            success: false,
            msg: "Utilisateur non connecté."
        });
    } else {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('users');
            var user = req.body.user;
            collection.updateOne({
                pseudo: pseudo
            }, {
                $set: {
                    "name": user.name,
                    "email": user.email,
                    "scolaire.code_postal": user.scolaire.code_postal,
                    "scolaire.etablissement": user.scolaire.etablissement,
                    "scolaire.classe": user.scolaire.classe,
                    "scolaire.numero_classe": user.scolaire.numero_classe,
                    "picture": user.picture,
                    "updatedAt": new Date().toISOString()
                }
            });
            res.json({
                success: true,
                msg: "Informations modifiées avec succès."
            });
        });
    }

});


apiRoutes.delete('/supprimerCours', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    var coursId = new mongo.ObjectID(req.query.coursId);
    if (!pseudo || !coursId)  {
        res.json({
            success: false,
            msg: "Erreur lors de la suppression du cours."
        });
    } else {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('cours');

            collection.remove({
                _id: coursId,
                auteur: pseudo
            });
        });
        res.json({
            success: true,
            msg: "Cours supprimé avec succès."
        })
    }
});

apiRoutes.post('/followUser', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    var userToFollow = req.body.user.toLowerCase();
    if (userToFollow === pseudo)  {
        res.json({
            success: false,
            msg: "Vous ne pouvez pas vous suivre vous-même."
        })
    } else  {

        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('users');

            collection.update({
                "pseudo": pseudo
            }, {
                $addToSet: {
                    "followed":  userToFollow
                }
            });
            res.json({
                success: true,
                msg: "Vous suivez désormais @" + userToFollow
            })
        });
    }
});

apiRoutes.delete('/unFollowUser', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    var userToUnFollow = req.query.user.toLowerCase();
    if (userToUnFollow === pseudo)  {
        res.json({
            success: false,
            msg: "Erreur lors de l'opération."
        })
    } else  {

        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('users');
            collection.update({
                "pseudo": pseudo
            }, {
                $pullAll: {
                    "followed":  [userToUnFollow]
                }
            });
            res.json({
                success: true,
                msg: "Vous ne suivez plus @" + userToUnFollow
            })
        });
    }
});

apiRoutes.get('/isFollowed', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    var userToCheck = req.query.pseudo.toLowerCase();
    if (userToCheck === pseudo)  {
        res.json({
            success: false,
            msg: "Erreur lors de l'opération."
        })
    } else  {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('users');
            collection.find({
                "pseudo": pseudo,
                "followed":  userToCheck
            }).toArray().then(function(data)  {
                if (data.length < 1)  {
                    res.json({
                        success: true,
                        isFollowed: false
                    });
                } else  {
                    res.json({
                        success: true,
                        isFollowed: true
                    });
                }
            });
        });
    }
});
apiRoutes.post('/rateCours', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    var pseudo = decoded.pseudo;
    var coursId = new mongo.ObjectID(req.body.coursId);
    var stars = req.body.stars;
    if (!stars || !pseudo || !coursId) {
        res.json({
            success: false,
            msg: "Erreur lors de l'envoi de la note."
        });
    } else {
        MongoClient.connect(config.database, function(err, db) {
            if (err) {
                return console.dir(err);
            }
            var collection = db.collection('cours');
            collection.update({
                    '_id': coursId
                }, {
                    $pull: {
                        "rates": {
                            pseudo: pseudo
                        }
                    }
                },
                false,
                true
            );
            var updateQuery = {
                '$addToSet': {
                    "rates": {
                        'pseudo': pseudo,
                        'rate': stars
                    }

                }
            };
            collection.update({
                _id: coursId,
            }, updateQuery);
        });
        res.json({
            success: true,
            msg: "Votre note a été transmise!"
        });
    }
});
apiRoutes.post('/OCR', function(req, res)  {
    if (!req.body.base64Image) {
        res.json({
            success: false,
            msg: "Merci d'envoyer une image."
        });
    } else {
        var options = {
            method: 'POST',
            url: 'https://api.ocr.space/parse/image',
            headers: {
                'postman-token': 'dd5e6b24-fa74-eb10-af2f-8fc0eff2c2f6',
                'cache-control': 'no-cache',
                'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'
            },
            formData: {
                apikey: 'f8d02bef3488957',
                base64Image: req.body.base64Image
            }
        };
        request(options, function(error, response, body) {
            if (error) throw new Error(error);
            console.log(body);
            res.send(body);
        });
    }
});
apiRoutes.post('/newCours', function(req, res) {
    var token = getToken(req.headers);
    var decoded;
    if (token) {
        var decoded = jwt.decode(token, config.secret);
    }
    if (req.body.classe === "Choisir" || req.body.titre === "Choisir" || req.body.matiere === "Choisir" || !req.body.titre) {
        res.json({
            success: false,
            msg: 'Merci de vérifier vos champs.'
        });
    } else if(req.body.cours_length < 300) {
        res.json({
            success: false,
            msg: "Votre cours n'est pas assez long."
        });
    } else {
        var newCours = {
            auteur: decoded.pseudo,
            classe: req.body.classe,
            titre: req.body.titre,
            matiere: req.body.matiere,
            chapitre: req.body.chapitre,
            content: req.body.cours,
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            lectures: 0,
            rates:  []

        };
        var insertDocument = function(db, callback) {
            db.collection('cours').insertOne(newCours, function(err, result) {
                res.json({
                    _id: result.ops[0]._id,
                    msg: 'Cours enregistré avec succès.'
                });
                callback();
            });
        };
        MongoClient.connect(config.database, function(err, db) {
            insertDocument(db, function() {
                db.close();
            });
        });
    }
});

// create a new user account (POST http://localhost:8080/api/signup)
apiRoutes.post('/signup', function(req, res) {
    if (!req.body.name || !req.body.password || !req.body.pseudo || !req.body.codepostal || !req.body.etablissement || !req.body.classe || !req.body.numero_classe) {
        res.json({
            success: false,
            msg: 'Merci de vérifier vos champs.'
        });
    } else {
        var newUser = new User({
            name: req.body.name,
            password: req.body.password,
            pseudo: req.body.pseudo.toLowerCase(),
            email: req.body.email,
            scolaire: {
                code_postal: parseInt(req.body.codepostal),
                etablissement: req.body.etablissement,
                classe: req.body.classe,
                numero_classe: req.body.numero_classe
            },
            picture: req.body.picture,
            followed: []
        });
        // save the user
        newUser.save(function(err) {
            if (err) {
                console.log(err);
                return res.json({
                    success: false,
                    msg: "L'utilisateur est déjà inscrit."
                });
            }
            res.json({
                success: true,
                msg: 'Utilisateur inscrit avec succès.'
            });
        });
    }
});

apiRoutes.post('/authenticate', function(req, res) {
    User.findOne({
        pseudo: req.body.pseudo.toLowerCase()
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
                        createdAt: user.createdAt
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


apiRoutes.get('/getuser', passport.authenticate('jwt', {
    session: false
}), function(req, res) {
    var token = getToken(req.headers);
    if (token) {
        var decoded = jwt.decode(token, config.secret);
        User.findOne({
            pseudo: decoded.pseudo
        }, {
            password: 0
        }, function(err, user) {
            if (err) throw err;

            if (!user) {
                return res.status(403).send({
                    success: false,
                    msg: 'Connexion échouée. Utilisateur non trouvé.'
                });
            } else {
                res.json(user);
            }
        });
    } else {
        return res.status(403).send({
            success: false,
            msg: 'No token provided.'
        });
    }
});

getToken = function(headers) {
    if (headers && headers.authorization) {
        var parted = headers.authorization.split(' ');
        if (parted.length === 2) {
            return parted[1];
        } else {
            return null;
        }
    } else {
        return null;
    }
};
// connect the api routes under /api/*
app.use('/api', apiRoutes);

// Start the server
app.listen(port);
console.log('Server at: http://localhost:' + port);
