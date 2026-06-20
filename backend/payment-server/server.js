require("dotenv").config()

const express = require("express")
const cors = require("cors")
const Stripe = require("stripe")

const app = express()

const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

app.use(cors())
app.use(express.json())

app.post("/v1/payment-intents", async (req, res) => {
  try {
    const { amount } = req.body

    const paymentIntent =
      await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      })

    res.json({
      clientSecret: paymentIntent.client_secret,
    })
  } catch (err) {
    res.status(500).json({
      error: err.message,
    })
  }
})

app.listen(process.env.PORT, () => {
  console.log(
    `Server running on port ${process.env.PORT}`
  )
})