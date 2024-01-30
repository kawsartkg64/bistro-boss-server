const express = require('express');
const cors = require('cors')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000


// middleware
app.use(cors())
app.use(express.json())



const { MongoClient, ServerApiVersion, Collection, ObjectId } = require('mongodb');
const uri =`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hvjsse5.mongodb.net/?retryWrites=true&w=majority`

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
    const menuCollection = client.db('BistrobossDB').collection('menu')
    const reviewCollection = client.db('BistrobossDB').collection('review')
    const cartCollection = client.db('BistrobossDB').collection('Cart')


    app.get('/menu', async(req, res)=>{
        const cursor = menuCollection.find()
        const result = await cursor.toArray()
        res.send(result)
    })

    app.get('/review', async(req, res)=>{
        const result = await reviewCollection.find().toArray()
        res.send(result)
    })

    // cart collection
    app.get('/carts', async(req, res)=>{
      const email = req.query.email;
      const query = {email:email}
      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/carts', async(req, res)=>{
      const cartItem = req.body
      const result = await cartCollection.insertOne(cartItem);
      res.send(result)

    })
    app.delete('/carts/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);








app.get('/', (req, res)=>{
    res.send("Bistro Boss Server Running")

})


app.listen(port, ()=>{
    console.log(`Bistro Boss Server Runnig on Post, ${port}`)
})