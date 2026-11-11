import uuid
from datetime import date, datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import TenantAwareModel, GUID


class Employee(TenantAwareModel):
    __tablename__ = "employees"

    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    branch_id = Column(GUID(), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)

    employee_code = Column(String(50), nullable=False, index=True)
    designation = Column(String(100), default="Delivery Executive", nullable=False)
    joining_date = Column(Date, default=date.today, nullable=False)

    base_salary = Column(Float, default=15000.0, nullable=False)
    per_delivery_incentive = Column(Float, default=5.0, nullable=False)  # ₹5 per successful jar delivery
    driving_license_number = Column(String(50), nullable=True)

    user = relationship("User")
    branch = relationship("Branch")


class Attendance(TenantAwareModel):
    __tablename__ = "attendance"

    employee_id = Column(GUID(), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, default=date.today, nullable=False, index=True)
    status = Column(String(50), default="present", nullable=False)  # present, absent, half_day, leave
    check_in = Column(DateTime(timezone=True), nullable=True)
    check_out = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    employee = relationship("Employee")


class Payroll(TenantAwareModel):
    __tablename__ = "payroll"

    employee_id = Column(GUID(), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)

    base_salary = Column(Float, nullable=False)
    deliveries_completed = Column(Integer, default=0, nullable=False)
    incentive_earned = Column(Float, default=0.0, nullable=False)
    bonus = Column(Float, default=0.0, nullable=False)
    deductions = Column(Float, default=0.0, nullable=False)
    net_salary = Column(Float, nullable=False)

    status = Column(String(50), default="draft", nullable=False)  # draft, approved, paid
    paid_at = Column(DateTime(timezone=True), nullable=True)
    payment_reference = Column(String(100), nullable=True)

    employee = relationship("Employee")

