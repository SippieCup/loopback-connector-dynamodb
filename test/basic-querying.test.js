// This test written in mocha+should.js
var should = require("./init.js");
var db, User;

describe('basic-querying', function() {

    before(function(done) {
        db = getSchema();

        User = db.define('User', {
            role: {
                type: String,
                id: 1,
                keyType: "hash",

                limit: 100
            },
            name: {
                type: String,
                sort: true,
                limit: 100
            },
            mail: {
                type: String,



                limit: 100
            },

            order: {
                type: Number,
                id: 2,
                keyType: "sort",

            },
            tasks: {
                type: String,
                sharding: true,
                splitter: "10kb"
            }
        });

        db.adapter.emitter.on("created-user", function() {
            User.destroyAll(done);
        });
        done();
    });


    describe('find', function() {

        before(function(done) {
            done();
        });

        it('should query by id without keys: Error out', function(done) {
            User.find("", function(err, u) {
                should.not.exist(u);
                should.exist(err);
                done();
            });
        });

        it('should query by ids, not found, should be empty array', function(done) {
            var query = {};
            query.where = {};
            query.where.role = "leaders";
            query.where.order = "25";

            User.find(query, function(err, u) {
                should.exist([]);
                should.exist(u);
                should.not.exist(err);
                done();
            });
        });

        it('should query by id: found', function(done) {
            var query = {};
            query.where = {};
            query.where.role = "leaders";
            query.where.order = "1";

            User.create(function(err, u) {
                should.not.exist(err);
                should.exist(u.id);
                User.find(query, function(err, u) {
                    should.exist(u);
                    should.not.exist(err);
                    u.should.be.an.instanceOf(User);
                    u.destroy(function(err) {
                        done();
                    });

                });
            });
        });

    });

    describe('all', function() {

        before(seed);

        it('should query collection', function(done) {
            User.all(function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.should.have.lengthOf(6);
                done();
            });
        });

        it('should query limited collection', function(done) {
            User.all({
                limit: 3
            }, function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.should.have.lengthOf(3);
                done();
            });
        });

        it('should query offset collection with limit', function(done) {
            User.all({
                skip: 1,
                limit: 4
            }, function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.should.have.lengthOf(4);
                done();
            });
        });

        it('should query filtered collection', function(done) {
            User.all({
                where: {
                    role: "lead"
                }
            }, function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.should.have.lengthOf(2);
                done();
            });
        });

        it('should query collection sorted by numeric field', function(done) {
            User.all({
                order: 'order'
            }, function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.forEach(function(u, i) {
                    u.order.should.eql(i + 1);
                });
                done();
            });
        });

        it('should query collection desc sorted by numeric field', function(done) {
            User.all({
                order: 'order DESC'
            }, function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.forEach(function(u, i) {
                    u.order.should.eql(users.length - i);
                });
                done();
            });
        });

        it('should query collection sorted by string field', function(done) {
            User.all({
                order: 'name'
            }, function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.shift().name.should.equal("George Harrison");
                users.shift().name.should.equal("John Lennon");
                users.pop().name.should.equal("Stuart Sutcliffe");
                done();
            });
        });

        it('should query collection desc sorted by string field', function(done) {
            User.all({
                order: 'name DESC'
            }, function(err, users) {
                should.exists(users);
                should.not.exists(err);
                users.pop().name.should.equal("George Harrison");
                users.pop().name.should.equal("John Lennon");
                users.shift().name.should.equal("Stuart Sutcliffe");
                done();
            });
        });

    });

    describe('count', function() {

        before(seed);

        it('should query total count', function(done) {
            User.count(function(err, n) {
                should.not.exist(err);
                should.exist(n);
                n.should.equal(6);
                done();
            });
        });

        it('should query filtered count', function(done) {
            User.count({
                role: 'lead'
            }, function(err, n) {
                should.not.exist(err);
                should.exist(n);
                n.should.equal(2);
                done();
            });
        });
    });

    describe('findOne', function() {

        before(seed);

        it('should work even when find by id', function(done) {
            User.findOne(function(e, u) {
                User.findOne({
                    where: {
                        id: u.id
                    }
                }, function(err, user) {
                    should.not.exist(err);
                    should.exist(user);
                    done();
                });
            });
        });

    });
});



describe('exists', function() {

    before(seed);

    it('should check whether record exist', function(done) {
        User.findOne(function(e, u) {
            User.exists(u.id, function(err, exists) {
                should.not.exist(err);
                should.exist(exists);
                exists.should.be.ok;
                done();
            });
        });
    });

    it('should check whether record not exist', function(done) {
        User.destroyAll(function() {
            User.exists("asdasd", function(err, exists) {
                should.not.exist(err);
                exists.should.not.be.ok;
                done();
            });
        });
    });

});

function seed(done) {
    var count = 0;
    var beatles = [{
            name: 'John Lennon',
            mail: 'john@b3atl3s.co.uk',
            role: 'lead',
            order: '2',
            tasks: 'Sing me a song'
        }, {
            name: 'Paul McCartney',
            mail: 'paul@b3atl3s.co.uk',
            role: 'lead',
            order: '1',
            tasks: 'Play me a tune'
        },
        {
            name: 'George Harrison',
            role: 'backer',
            order: '5'
        },
        {
            name: 'Ringo Starr',
            role: 'backer',
            order: '6'
        },
        {
            name: 'Pete Best',
            role: 'backer',
            order: '4'
        },
        {
            name: 'Stuart Sutcliffe',
            role: 'backer',
            order: "3"
        }
    ];

    User.destroyAll(function() {
        beatles.forEach(function(beatle) {
            User.create(beatle, ok);
        });
    });


    function ok() {
        if (++count === beatles.length) {
            done();
        }
    }
}