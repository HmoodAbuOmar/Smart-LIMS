package com.smartlims.laboratory.service;

import com.smartlims.orders.entity.*;
import com.smartlims.orders.repository.OrderItemRepository;
import com.smartlims.results.repository.TestResultRepository;
import com.smartlims.visits.entity.Visit;
import com.smartlims.visits.repository.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class OrderCompletion {
 private final OrderItemRepository items;private final TestResultRepository results;private final VisitRepository visits;
 public OrderCompletion(OrderItemRepository items,TestResultRepository results,VisitRepository visits){this.items=items;this.results=results;this.visits=visits;}
 @Transactional(propagation=Propagation.MANDATORY) public void reconsider(TestOrder order){
  if(order.getStatus()!=OrderStatus.IN_PROGRESS||visits.existsByOrder_IdAndStatus(order.getId(),Visit.Status.OPEN))return;
  var selected=items.findByOrder_Id(order.getId());if(!selected.isEmpty()&&selected.stream().allMatch(i->results.findByItem_IdAndCurrentTrue(i.getId()).isPresent()))order.setStatus(OrderStatus.COMPLETED);
 }
}
