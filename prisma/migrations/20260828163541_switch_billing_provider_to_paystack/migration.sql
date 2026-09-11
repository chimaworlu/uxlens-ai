/*
  Warnings:

  - You are about to drop the column `flutterwaveCustomerId` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `flutterwavePlanId` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `flutterwaveSubscriptionId` on the `Subscription` table. All the data in the column will be lost.
  - Added the required column `paystackPlanCode` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "flutterwaveCustomerId",
DROP COLUMN "flutterwavePlanId",
DROP COLUMN "flutterwaveSubscriptionId",
ADD COLUMN     "paystackCustomerCode" TEXT,
ADD COLUMN     "paystackEmailToken" TEXT,
ADD COLUMN     "paystackPlanCode" TEXT NOT NULL,
ADD COLUMN     "paystackSubscriptionCode" TEXT;
