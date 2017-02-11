var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt');

// Thanks to http://blog.matoski.com/articles/jwt-express-node-mongoose/

// set up a mongoose model
var UserSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: false
    },
    email: {
        type: String,
        required: false,
        unique: false
    },
    pseudo: {
        type: String,
        required: true,
        unique: true
    },
    scolaire: {
        code_postal: {
            type: String,
        },
        etablissement: {
            type: String,
        },
        classe: {
            type: String,
        },
        numero_classe: {
            type: String,
        }
    },
    picture: {
        type: String,
    },
    role :{
        type: String
    },
    password: {
        type: String,
        required: true
    },
    verified: {
        type: Boolean
    }
}, {
    timestamps: true
});

UserSchema.pre('save', function(next) {
    var user = this;
    user.role = 'user';
    if (this.isModified('password') || this.isNew) {
        bcrypt.genSalt(10, function(err, salt) {
            if (err) {
                return next(err);
            }
            bcrypt.hash(user.password, salt, function(err, hash) {
                if (err) {
                    return next(err);
                }
                user.password = hash;
                next();
            });
        });
    } else {
        return next();
    }
});

UserSchema.methods.comparePassword = function(passw, cb) {
    bcrypt.compare(passw, this.password, function(err, isMatch) {
        if (err) {
            return cb(err);
        }
        cb(null, isMatch);
    });
};

module.exports = mongoose.model('User', UserSchema);
