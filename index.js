const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const jwt = require('jsonwebtoken');
require('dotenv').config()
// stripe setup 
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)

const app = express();
const port = process.env.PORT || 5000;


//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }

    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qtselqx.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const db = client.db('summerCamp');
        const classCollection = db.collection('class');
        const usersCollection = db.collection('users');
        const cartsCollection = db.collection('carts');
        const paymentCollection = db.collection('payments');


        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        //Student pannel
        app.get('/instructors', async (req, res) => {
            const result = await usersCollection.find({ role: 'instructor' }).toArray();
            res.send(result);
        });

        app.get('/topInstructors', async (req, res) => {
            const result = await usersCollection.find({ role: 'instructor' }).limit(6).toArray();
            res.send(result);
        });

        app.get('/approvedClass', async (req, res) => {
            const result = await classCollection.find({ status: 'approved' }).toArray();
            res.send(result);
        });

// -----------Admin------------

        //admin panel users data
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        //admin panel post data
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });


        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })

        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })

        //Admin approve
        app.patch('/users/status/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved',
                },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        //Admin denied
        app.patch('/users/denied/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'denied',
                },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        //Admin feedback
        app.patch('/users/feedback/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        feedback: req.body.feedback,
                    },
                };
                const result = await classCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                res.status(500).send(error);
            }
        });


        //Set Admin ROle
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })
        //Set instructor Role
        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        //----------Instructor--------- 

        //get all class data
        app.get('/class', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result);
        });

        app.get('/topClass', async (req, res) => {
            try {
              const result = await classCollection.find().sort({ enClass: -1 }).limit(6).toArray();
              res.send(result);
            } catch (error) {
              console.error(error);
              res.status(500).send({ error: true, message: 'Internal server error' });
            }
          });
          

        //get one specific data
        app.get('/class/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollection.findOne(query)
            res.send(result)
        })

        //get some data
        app.get('/someClass', async (req, res) => {
            console.log(req.query.email);
            let query = {};
            if (req.query?.email) {
                query = { email: req.query.email }
            }
            const result = await classCollection.find(query).toArray();
            res.send(result);
        });

        // Post class data
        app.post('/class', async (req, res) => {
            const addedItem = req.body;
            const result = await classCollection.insertOne(addedItem);
            res.send(result);
        });

        //update
        app.put('/class/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const addedClass = req.body;
            const item = {
                $set: {
                    class_name: addedClass.name,
                    price: addedClass.price,
                    seat: addedClass.seat,
                }
            }

            const result = await classCollection.updateOne(query, item, options);
            res.send(result);
        })


        //-------Student-------
        app.get('/carts', async (req, res) => {
            const email = req.query.email;

            if (!email) {
                res.send([]);
            }

            const query = { email: email };
            const result = await cartsCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartsCollection.findOne(query)
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const item = req.body;

            const existingCarts = await cartsCollection.findOne(item);

            if(existingCarts){
                console.log(existingCarts);
                res.status(400).send('Selected class already exists');
                return;
            }

            const result = await cartsCollection.insertOne(item);
            res.send(result);
        })


        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartsCollection.deleteOne(query);
            res.send(result);
        })

        // create payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related api
        //show payment data for specific user 
        app.get('/payments', async (req, res) => {
            let query = {};
            if (req.query?.email) {
              query = { email: req.query.email }
            }
                    
            const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
            res.send(result);
          });



        //     res.send({ insertResult, deleteResult });
        // })

        app.post('/payments', async (req, res) => {
            try {
              const payment = req.body;
              const insertResult = await paymentCollection.insertOne(payment);
          
              const query = { classId: payment.classId };
              const cart = await cartsCollection.findOne(query);
              if (!cart) {
                return res.status(404).send({ error: true, message: 'Cart not found' });
              }
          
              const updateClassQuery = { _id: new ObjectId(cart.classId) };
              const classUpdate = {
                $inc: { enClass: 1, seat: -1 },
                $currentDate: { updatedAt: true }
              };
              const updateResult = await classCollection.updateOne(updateClassQuery, classUpdate);
              if (updateResult.modifiedCount !== 1) {
                return res.status(500).send({ error: true, message: 'Failed to update class' });
              }
          
              const deleteResult = await cartsCollection.deleteOne(query);

              if (deleteResult.deletedCount !== 1) {
                return res.status(500).send({ error: true, message: 'Failed to delete cart' });
              }
          
              res.send({ insertResult, deleteResult });
            } catch (error) {
              console.error(error);
              res.status(500).send({ error: true, message: 'Internal server error' });
            }
          });
          


















        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);







app.get('/', (req, res) => {
    res.send(`The Summer Camp server is running on port ${port}`)
})

app.listen(port, () => {
    console.log(`The Summer Camp server is running on port ${port}`);
})
