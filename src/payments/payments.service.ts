import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { envVars, NATS_SERVICE } from 'src/config';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('PaymentsService');
  private readonly stripe = new Stripe(envVars.STRIPE_SECRET);

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;

    const lineItems = items.map((item) => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(item.price * 100), // 20 dolares 2000 / 100 = 20.00
      },
      quantity: item.quantity,
    }));

    const session = await this.stripe.checkout.sessions.create({
      payment_intent_data: {
        metadata: { orderId },
      },
      line_items: lineItems,
      mode: 'payment',
      success_url: envVars.STRIPE_SUCCESS_URL,
      cancel_url: envVars.STRIPE_CANCEL_URL,
    });

    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }

  async stripeWebhook(req: Request, res: Response) {
    const sign = req.headers['stripe-signature'];
    let event: Stripe.Event;
    // Testing
    // const endpointSecret =
    //   'whsec_1c1378ab45b6a9bb899119fa6cb73eec545ea20e608fb237b61496d6b6bc8cd9';

    // Real
    // const endpointSecret = 'whsec_L0e9u4s5yzC11YN8BnTC6BNmjix14D36';

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sign,
        envVars.STRIPE_ENDPOINT_SECRET,
      );
    } catch (err) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'charge.succeeded': {
        const chargeSucceeded = event.data.object;
        const payload = {
          stripePaymentId: chargeSucceeded.id,
          orderId: chargeSucceeded.metadata.orderId,
          receiptUrl: chargeSucceeded.receipt_url,
        };
        this.client.emit('payment.succeeded', payload);
        break;
      }
      default:
        console.log(`Event ${event.type} not handled.`);
    }

    return res.status(HttpStatus.OK).json({ sign });
  }
}
