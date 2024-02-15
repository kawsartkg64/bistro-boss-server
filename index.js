require('dotenv').config()
const express = require('express');
const cors = require('cors')
const jwt = require('jsonwebtoken')
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const app = express()
const port = process.env.PORT || 5000


// middleware
app.use(cors())
app.use(express.json())



const { MongoClient, ServerApiVersion, Collection, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hvjsse5.mongodb.net/?retryWrites=true&w=majority`


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {

  try {

    const menuCollection = client.db('BistrobossDB').collection('menu')
    const reviewCollection = client.db('BistrobossDB').collection('review')
    const cartCollection = client.db('BistrobossDB').collection('Cart')
    const userCollection = client.db('BistrobossDB').collection('user')
    const paymentCollection = client.db('BistrobossDB').collection('payment')



    // middleware verify token api
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {

        return res.status(401).send({ message: 'forbidden access' })
      }
      const token = req.headers.authorization.split(' ')[1]

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'forbidden access' })
        }
        req.decoded = decoded
        next();

      })

    }
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollection.findOne(query)
      const isAdmin = user?.role === 'admin'
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }


    // user related api
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      console.log(req.headers)
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })
    app.delete('/users/:id', verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '2h' })
      res.send({ token })
    })

    // payment
    app.get('/payments/:email', verifyToken, async(req,res)=>{
        const query ={email: req.params.email};
        if(req.params.email !== req.decoded.email){
          return res.status(403).send({message: 'forbidden access'})
        }
        const result = await paymentCollection.find(query).toArray();
        res.send(result)
    })


    app.post('/payments', async(req, res)=>{
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment)
      const query = {_id: {
        $in: payment.cartId.map(id => new ObjectId(id))
      }}
      const deleteResult = await cartCollection.deleteMany(query)
      res.send({paymentResult, deleteResult})
    })

    // payment intent
    app.post('/create-payment-intent', async(req, res)=>{
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount:amount,
        currency:'usd',
        payment_method_types:['card']
      })
      console.log(paymentIntent)
      res.send(
        {
          clientSecret: paymentIntent.client_secret
        }
      )
    })



    app.get('/order-stats', verifyToken, verifyAdmin, async(req,res)=>{
     const result = await paymentCollection.aggregate([
     {$unwind: { path: "$menuId" }},
      {
        $lookup: {
         
          from: 'menu',
          let: { menuId: { $toObjectId: "$menuId" } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$menuId"] }
              }
            }
          ],
          
          as:"menuDetail"
        }
      },
      { $unwind:  { path: "$menuDetail" }},
      {
        $group: {
          _id: '$menuDetail.category',
          quantity:{$sum:1},
          totalRevenue:{
            $sum: "$menuDetail.price"
          }
        }
      },
      {$project: {
        _id:0,
        category: '$_id',
        quantity: '$quantity',
        revenue: '$totalRevenue'
      }}
     ]).toArray()
     res.send(result)
    })


    app.get('/admin-stats', async(req,res)=>{
      const user = await userCollection.estimatedDocumentCount()
      const menuItem = await menuCollection.estimatedDocumentCount();
      const order = await paymentCollection.estimatedDocumentCount();
      // const payments = await paymentCollection.find().toArray()
      // const revenue = payments.reduce((total, item)=> total+item.price, 0)

      const result = await paymentCollection.aggregate([
        { $group:{
          _id:null,
          totalRevenue:{
            $sum : '$price'
          }
        }}
      ]).toArray()
      const revenue = result.length > 0 ? result[0].totalRevenue:0;

      res.send({
        user,
        menuItem,
        order,
        revenue,
       
      })
    })
    // admin related api
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send(({ message: 'unauthorized access' }))
      }
      const query = { email: email };
      const user = await userCollection.findOne(query)
      let admin = false
      if (user) {
        admin = user?.role === 'admin'
      }
      res.send({ admin })
    })


    app.patch('/users/admin/:id', async (req, res) => {

      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: "admin"
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc)
      res.send(result)
    })




    app.get('/menu', async (req, res) => {
      const cursor = menuCollection.find()
      const result = await cursor.toArray()
      res.send(result)
    })

    
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query)
      console.log(result)
      res.send(result)
    })

    app.post('/menu', async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item)
      res.send(result)
    })

    app.patch('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image,

        }
      }
      const result = await menuCollection.updateOne(filter, updateDoc)
      res.send(result)
    })


    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query)
      res.send(result)
    })

    app.get('/review', async (req, res) => {
      const result = await reviewCollection.find().toArray()
      res.send(result)
    })



    // cart collection

    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email }
      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/carts', async (req, res) => {
      const cartItem = req.body
      const result = await cartCollection.insertOne(cartItem);
      res.send(result)

    })
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);








app.get('/', (req, res) => {
  res.send("Bistro Boss Server Running")

})


app.listen(port, () => {
  console.log(`Bistro Boss Server Runnig on Post, ${port}`)
})